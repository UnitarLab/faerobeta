-- ═══════════════════════════════════════════════════════════════════════
--  FAERO — BETA LAUNCH MIGRATION
--  Run this in Supabase → SQL Editor. It is idempotent: safe to re-run.
--
--  Covers the server half of the beta launch blockers:
--    #2  ghost accounts        → handle_new_user trigger + username collision
--    #3  replies               → replies table, counts, RLS
--    #4  racy like counts      → like_count owned by DB triggers, RPC toggle
--    #7  account deletion      → request_account_deletion + purge
--    #8  block / mute          → blocks table + feed filtering
--    #9  report queue          → reports status workflow + staff read policy
--    #10 group creation        → groups insert policy + create_group RPC
--    P1  rate limiting         → per-user insert throttles
--    P1  notifications         → triggers for like / follow / reply / mention
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 0.  Helpers
-- ─────────────────────────────────────────────────────────────────────

-- Is the calling user staff? SECURITY DEFINER so policies can call it
-- without recursing into profiles' own RLS.
create or replace function public.is_staff()
returns boolean
language sql stable security definer set search_path = public
as $$
  select coalesce(
    (select role in ('admin','mod') from public.profiles where id = auth.uid()),
    false
  );
$$;

-- Generic per-user rate limiter. Raises if the user has inserted more than
-- `max_rows` rows into `tbl` within `window_seconds`.
create or replace function public.enforce_rate_limit(
  tbl text, user_col text, uid uuid, max_rows int, window_seconds int
) returns void
language plpgsql security definer set search_path = public
as $$
declare n int;
begin
  execute format(
    'select count(*) from public.%I where %I = $1 and created_at > now() - ($2 || '' seconds'')::interval',
    tbl, user_col
  ) into n using uid, window_seconds;

  if n >= max_rows then
    raise exception 'RATE_LIMIT: too many % in the last % seconds (max %)',
      tbl, window_seconds, max_rows
      using errcode = 'P0001';
  end if;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 1.  #2 — Ghost accounts: profile is created server-side, always
-- ─────────────────────────────────────────────────────────────────────
-- The client can no longer be responsible for inserting the profile row
-- (it has no session when email confirmation is on). This trigger runs as
-- the definer on auth.users insert and guarantees a profile exists with a
-- unique username.

create or replace function public.faero_unique_username(base text)
returns text
language plpgsql stable security definer set search_path = public
as $$
declare
  slug text;
  candidate text;
  n int := 0;
begin
  slug := lower(coalesce(nullif(trim(base), ''), 'seedling'));
  slug := regexp_replace(slug, '\s+', '.', 'g');
  slug := regexp_replace(slug, '[^a-z0-9._]', '', 'g');
  slug := regexp_replace(slug, '^[._]+|[._]+$', '', 'g');
  slug := left(nullif(slug, ''), 24);
  if slug is null or slug = '' then slug := 'seedling'; end if;

  candidate := slug;
  while exists (select 1 from public.profiles where username = candidate) loop
    n := n + 1;
    candidate := left(slug, 24 - length(n::text) - 1) || '.' || n::text;
    if n > 9999 then
      candidate := slug || '.' || substr(md5(random()::text), 1, 6);
      exit;
    end if;
  end loop;
  return candidate;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  nm text;
begin
  nm := coalesce(
    nullif(new.raw_user_meta_data->>'display_name', ''),
    nullif(new.raw_user_meta_data->>'full_name', ''),
    split_part(new.email, '@', 1)
  );

  insert into public.profiles (id, username, display_name, badge, created_at)
  values (new.id, public.faero_unique_username(nm), nm, '🌱', now())
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any accounts that were created before this trigger existed
-- (the "ghost accounts" already in the wild).
insert into public.profiles (id, username, display_name, badge, created_at)
select u.id,
       public.faero_unique_username(
         coalesce(nullif(u.raw_user_meta_data->>'display_name',''), split_part(u.email,'@',1))
       ),
       coalesce(nullif(u.raw_user_meta_data->>'display_name',''), split_part(u.email,'@',1)),
       '🌱',
       u.created_at
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

-- ─────────────────────────────────────────────────────────────────────
-- 2.  #8 — Blocks / mutes
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  kind       text not null default 'block' check (kind in ('block','mute')),
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id)
);

create index if not exists blocks_blocker_idx on public.blocks(blocker_id);
create index if not exists blocks_blocked_idx on public.blocks(blocked_id);

alter table public.blocks enable row level security;

drop policy if exists "blocks: owner reads"   on public.blocks;
drop policy if exists "blocks: owner writes"  on public.blocks;
drop policy if exists "blocks: owner deletes" on public.blocks;

create policy "blocks: owner reads"   on public.blocks for select using (blocker_id = auth.uid());
create policy "blocks: owner writes"  on public.blocks for insert with check (blocker_id = auth.uid() and blocked_id <> auth.uid());
create policy "blocks: owner deletes" on public.blocks for delete using (blocker_id = auth.uid());

-- Symmetric check used by feed/DM filtering: true if either party blocked
-- the other. Mutes are one-directional and only hide from the muter's feed.
create or replace function public.is_blocked(a uuid, b uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where kind = 'block'
      and ((blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a))
  );
$$;

-- Blocking someone tears down the relationship both ways.
create or replace function public.on_block_created()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.kind = 'block' then
    delete from public.follows
     where (follower_id = new.blocker_id and following_id = new.blocked_id)
        or (follower_id = new.blocked_id and following_id = new.blocker_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_on_block_created on public.blocks;
create trigger trg_on_block_created
  after insert on public.blocks
  for each row execute function public.on_block_created();

-- ─────────────────────────────────────────────────────────────────────
-- 3.  #3 — Replies
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.replies (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  parent_id   uuid references public.replies(id) on delete cascade,
  body        text not null check (char_length(body) between 1 and 2000),
  like_count  int  not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists replies_post_idx    on public.replies(post_id, created_at);
create index if not exists replies_user_idx    on public.replies(user_id);
create index if not exists replies_parent_idx  on public.replies(parent_id);

alter table public.posts add column if not exists reply_count int not null default 0;
alter table public.posts add column if not exists edited_at timestamptz;

alter table public.replies enable row level security;

drop policy if exists "replies: public read"   on public.replies;
drop policy if exists "replies: author writes" on public.replies;
drop policy if exists "replies: author edits"  on public.replies;
drop policy if exists "replies: author or staff deletes" on public.replies;

create policy "replies: public read" on public.replies
  for select using (not public.is_blocked(auth.uid(), user_id));

create policy "replies: author writes" on public.replies
  for insert with check (
    user_id = auth.uid()
    and not exists (select 1 from public.bans where user_id = auth.uid() and (expires_at is null or expires_at > now()))
  );

create policy "replies: author edits" on public.replies
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "replies: author or staff deletes" on public.replies
  for delete using (user_id = auth.uid() or public.is_staff());

-- reply_count is owned by the database, never the client.
create or replace function public.sync_reply_count()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set reply_count = reply_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set reply_count = greatest(0, reply_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_reply_count on public.replies;
create trigger trg_sync_reply_count
  after insert or delete on public.replies
  for each row execute function public.sync_reply_count();

-- Rate limit: 20 replies / 5 minutes
create or replace function public.throttle_replies()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.enforce_rate_limit('replies', 'user_id', new.user_id, 20, 300);
  return new;
end;
$$;

drop trigger if exists trg_throttle_replies on public.replies;
create trigger trg_throttle_replies
  before insert on public.replies
  for each row execute function public.throttle_replies();

-- ─────────────────────────────────────────────────────────────────────
-- 4.  #4 — like_count owned by the database
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.sync_like_count()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.posts set like_count = greatest(0, like_count - 1) where id = old.post_id;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_like_count on public.likes;
create trigger trg_sync_like_count
  after insert or delete on public.likes
  for each row execute function public.sync_like_count();

-- Reconcile any drift from the client-authoritative era.
update public.posts p
   set like_count = c.n
  from (select post_id, count(*)::int n from public.likes group by post_id) c
 where c.post_id = p.id and p.like_count is distinct from c.n;

update public.posts p
   set like_count = 0
 where not exists (select 1 from public.likes l where l.post_id = p.id)
   and p.like_count <> 0;

-- Single round-trip, race-free toggle. Returns the authoritative state.
create or replace function public.toggle_like(p_post_id uuid)
returns table (liked boolean, like_count int)
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existed boolean;
begin
  if uid is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  delete from public.likes where post_id = p_post_id and user_id = uid;
  existed := found;

  if not existed then
    insert into public.likes (post_id, user_id) values (p_post_id, uid)
    on conflict do nothing;
  end if;

  return query
    select (not existed), p.like_count from public.posts p where p.id = p_post_id;
end;
$$;

-- Clients must not be able to write counts directly. Re-create the posts
-- update policy so like_count / reply_count are immutable from the client.
create or replace function public.guard_post_counts()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- Allow trigger-driven changes (they run with a null auth.uid() under
  -- SECURITY DEFINER from sync_* functions); block direct client edits.
  if auth.uid() is not null and current_setting('role', true) = 'authenticated' then
    new.like_count  := old.like_count;
    new.reply_count := old.reply_count;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_post_counts on public.posts;
create trigger trg_guard_post_counts
  before update on public.posts
  for each row execute function public.guard_post_counts();

-- Rate limit: 15 posts / 10 minutes
create or replace function public.throttle_posts()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.enforce_rate_limit('posts', 'user_id', new.user_id, 15, 600);
  return new;
end;
$$;

drop trigger if exists trg_throttle_posts on public.posts;
create trigger trg_throttle_posts
  before insert on public.posts
  for each row execute function public.throttle_posts();

-- Rate limit: 60 messages / 5 minutes
create or replace function public.throttle_messages()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.enforce_rate_limit('messages', 'sender_id', new.sender_id, 60, 300);
  return new;
end;
$$;

drop trigger if exists trg_throttle_messages on public.messages;
create trigger trg_throttle_messages
  before insert on public.messages
  for each row execute function public.throttle_messages();

-- ─────────────────────────────────────────────────────────────────────
-- 5.  P1 — Notifications actually fire
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.notifications (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete cascade,
  type         text not null,
  entity_id    uuid,
  entity_type  text,
  body         text,
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications(user_id) where read = false;

alter table public.notifications enable row level security;

drop policy if exists "notif: owner reads"   on public.notifications;
drop policy if exists "notif: owner updates" on public.notifications;
create policy "notif: owner reads"   on public.notifications for select using (user_id = auth.uid());
create policy "notif: owner updates" on public.notifications for update using (user_id = auth.uid());
-- No client insert policy: notifications are created by triggers only.

create or replace function public.push_notification(
  p_user uuid, p_actor uuid, p_type text,
  p_entity uuid, p_entity_type text, p_body text
) returns void
language plpgsql security definer set search_path = public
as $$
begin
  if p_user is null or p_user = p_actor then return; end if;
  if public.is_blocked(p_user, p_actor) then return; end if;

  insert into public.notifications (user_id, actor_id, type, entity_id, entity_type, body)
  values (p_user, p_actor, p_type, p_entity, p_entity_type, p_body);
end;
$$;

create or replace function public.notify_on_like()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.posts where id = new.post_id;
  perform public.push_notification(owner_id, new.user_id, 'like', new.post_id, 'post', null);
  return null;
end; $$;

drop trigger if exists trg_notify_like on public.likes;
create trigger trg_notify_like after insert on public.likes
  for each row execute function public.notify_on_like();

create or replace function public.notify_on_follow()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.push_notification(new.following_id, new.follower_id, 'follow', new.follower_id, 'profile', null);
  return null;
end; $$;

drop trigger if exists trg_notify_follow on public.follows;
create trigger trg_notify_follow after insert on public.follows
  for each row execute function public.notify_on_follow();

-- Reply notification + @mention fan-out in one pass.
create or replace function public.notify_on_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  owner_id uuid;
  handle   text;
  mentioned uuid;
begin
  select user_id into owner_id from public.posts where id = new.post_id;
  perform public.push_notification(owner_id, new.user_id, 'reply', new.id, 'reply', left(new.body, 140));

  for handle in
    select distinct lower(m[1])
    from regexp_matches(new.body, '@([A-Za-z0-9._]{2,24})', 'g') m
  loop
    select id into mentioned from public.profiles where lower(username) = handle;
    if mentioned is not null and mentioned <> owner_id then
      perform public.push_notification(mentioned, new.user_id, 'mention', new.id, 'reply', left(new.body, 140));
    end if;
  end loop;

  return null;
end; $$;

drop trigger if exists trg_notify_reply on public.replies;
create trigger trg_notify_reply after insert on public.replies
  for each row execute function public.notify_on_reply();

create or replace function public.notify_on_post_mention()
returns trigger language plpgsql security definer set search_path = public as $$
declare handle text; mentioned uuid;
begin
  for handle in
    select distinct lower(m[1])
    from regexp_matches(coalesce(new.body,''), '@([A-Za-z0-9._]{2,24})', 'g') m
  loop
    select id into mentioned from public.profiles where lower(username) = handle;
    if mentioned is not null then
      perform public.push_notification(mentioned, new.user_id, 'mention', new.id, 'post', left(new.body, 140));
    end if;
  end loop;
  return null;
end; $$;

drop trigger if exists trg_notify_post_mention on public.posts;
create trigger trg_notify_post_mention after insert on public.posts
  for each row execute function public.notify_on_post_mention();

create or replace function public.mark_notifications_read()
returns void language sql security definer set search_path = public as $$
  update public.notifications set read = true where user_id = auth.uid() and read = false;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 6.  #9 — Report queue
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid references public.profiles(id) on delete set null,
  reported_user_id  uuid references public.profiles(id) on delete cascade,
  entity_id         uuid,
  entity_type       text default 'post',
  reason            text,
  status            text not null default 'open' check (status in ('open','reviewing','actioned','dismissed')),
  resolved_by       uuid references public.profiles(id) on delete set null,
  resolved_at       timestamptz,
  resolution_note   text,
  created_at        timestamptz not null default now()
);

alter table public.reports add column if not exists status text not null default 'open';
alter table public.reports add column if not exists resolved_by uuid references public.profiles(id) on delete set null;
alter table public.reports add column if not exists resolved_at timestamptz;
alter table public.reports add column if not exists resolution_note text;

create index if not exists reports_status_idx on public.reports(status, created_at desc);

alter table public.reports enable row level security;

drop policy if exists "reports: user files"    on public.reports;
drop policy if exists "reports: staff reads"   on public.reports;
drop policy if exists "reports: staff updates" on public.reports;

create policy "reports: user files" on public.reports
  for insert with check (reporter_id = auth.uid());
create policy "reports: staff reads" on public.reports
  for select using (public.is_staff() or reporter_id = auth.uid());
create policy "reports: staff updates" on public.reports
  for update using (public.is_staff());

create or replace function public.resolve_report(p_id uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'FORBIDDEN' using errcode = 'P0001'; end if;
  update public.reports
     set status = p_status,
         resolved_by = auth.uid(),
         resolved_at = now(),
         resolution_note = p_note
   where id = p_id;
end; $$;

create or replace function public.open_report_count()
returns int language sql stable security definer set search_path = public as $$
  select case when public.is_staff()
    then (select count(*)::int from public.reports where status = 'open')
    else 0 end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 7.  #10 — Group creation
-- ─────────────────────────────────────────────────────────────────────

alter table public.groups add column if not exists owner_id uuid references public.profiles(id) on delete set null;
alter table public.groups add column if not exists slug text;
alter table public.groups add column if not exists is_private boolean not null default false;
alter table public.groups add column if not exists created_at timestamptz not null default now();

create unique index if not exists groups_slug_key on public.groups(slug) where slug is not null;

alter table public.groups enable row level security;

drop policy if exists "groups: public read"  on public.groups;
drop policy if exists "groups: member create" on public.groups;
drop policy if exists "groups: owner updates" on public.groups;

create policy "groups: public read"   on public.groups for select using (true);
create policy "groups: member create" on public.groups for insert with check (owner_id = auth.uid());
create policy "groups: owner updates" on public.groups for update using (owner_id = auth.uid() or public.is_staff());

create or replace function public.create_group(
  p_name text, p_description text, p_tags text[] default '{}', p_image_url text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  new_id uuid;
  base text;
  v_slug text;              -- NOT `slug`: that collides with groups.slug
  n int := 0;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  if char_length(trim(coalesce(p_name,''))) < 3 then
    raise exception 'Commons name must be at least 3 characters' using errcode = 'P0001';
  end if;

  perform public.enforce_rate_limit('groups', 'owner_id', uid, 3, 86400);

  base := regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g');
  base := left(regexp_replace(base, '^-+|-+$', '', 'g'), 40);
  v_slug := base;
  while exists (select 1 from public.groups g where g.slug = v_slug) loop
    n := n + 1; v_slug := base || '-' || n::text;
  end loop;

  insert into public.groups (name, description, tags, image_url, owner_id, slug)
  values (trim(p_name), nullif(trim(coalesce(p_description,'')), ''), coalesce(p_tags,'{}'), p_image_url, uid, v_slug)
  returning id into new_id;

  insert into public.group_members (group_id, user_id, role)
  values (new_id, uid, 'owner')
  on conflict do nothing;

  return new_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 8.  P1 — Bookmarks
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.bookmarks (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  post_id    uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

alter table public.bookmarks enable row level security;
drop policy if exists "bookmarks: owner all" on public.bookmarks;
create policy "bookmarks: owner all" on public.bookmarks
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 9.  #7 — Real account deletion
-- ─────────────────────────────────────────────────────────────────────
-- Deleting from auth.users requires the service role, so the client calls
-- this RPC which anonymises + tombstones immediately, and the scheduled
-- purge (or the delete-account Edge Function) removes the auth row.

alter table public.profiles add column if not exists deleted_at timestamptz;
alter table public.profiles add column if not exists tos_accepted_at timestamptz;
alter table public.profiles add column if not exists tos_version text;
alter table public.profiles add column if not exists dob_confirmed boolean not null default false;
alter table public.profiles add column if not exists onboarded_at timestamptz;

create or replace function public.request_account_deletion()
returns void
language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;

  delete from public.posts      where user_id = uid;
  delete from public.replies    where user_id = uid;
  delete from public.likes      where user_id = uid;
  delete from public.follows    where follower_id = uid or following_id = uid;
  delete from public.messages   where sender_id = uid;
  delete from public.guestbook  where author_id = uid or profile_id = uid;
  delete from public.bookmarks  where user_id = uid;
  delete from public.blocks     where blocker_id = uid or blocked_id = uid;
  delete from public.notifications where user_id = uid or actor_id = uid;
  delete from public.group_members where user_id = uid;

  update public.profiles
     set display_name = 'deleted user',
         username     = 'deleted.' || substr(md5(uid::text), 1, 10),
         bio = null, avatar_url = null, banner_url = null,
         location = null, website = null, tags = '{}',
         deleted_at = now()
   where id = uid;
end;
$$;

-- Service-role variant used by the delete-account Edge Function, which has
-- already verified the caller's JWT and so passes the uid explicitly.
create or replace function public.request_account_deletion_for(p_uid uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.posts      where user_id = p_uid;
  delete from public.replies    where user_id = p_uid;
  delete from public.likes      where user_id = p_uid;
  delete from public.follows    where follower_id = p_uid or following_id = p_uid;
  delete from public.messages   where sender_id = p_uid;
  delete from public.guestbook  where author_id = p_uid or profile_id = p_uid;
  delete from public.bookmarks  where user_id = p_uid;
  delete from public.blocks     where blocker_id = p_uid or blocked_id = p_uid;
  delete from public.notifications where user_id = p_uid or actor_id = p_uid;
  delete from public.group_members where user_id = p_uid;

  update public.profiles
     set display_name = 'deleted user',
         username     = 'deleted.' || substr(md5(p_uid::text), 1, 10),
         bio = null, avatar_url = null, banner_url = null,
         location = null, website = null, tags = '{}',
         deleted_at = now()
   where id = p_uid;
end;
$$;

revoke execute on function public.request_account_deletion_for(uuid) from anon, authenticated;

-- Companion for the Edge Function (service role) — hard-removes auth rows
-- for profiles tombstoned more than 30 days ago.
create or replace function public.purge_deleted_accounts()
returns int
language plpgsql security definer set search_path = public, auth
as $$
declare n int;
begin
  with gone as (
    delete from auth.users u
    using public.profiles p
    where p.id = u.id and p.deleted_at is not null and p.deleted_at < now() - interval '30 days'
    returning u.id
  )
  select count(*)::int into n from gone;
  return n;
end;
$$;

create or replace function public.accept_terms(p_version text)
returns void language sql security definer set search_path = public as $$
  update public.profiles
     set tos_accepted_at = now(), tos_version = p_version, dob_confirmed = true
   where id = auth.uid();
$$;

create or replace function public.complete_onboarding()
returns void language sql security definer set search_path = public as $$
  update public.profiles set onboarded_at = now() where id = auth.uid();
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 10.  Feed / discovery RPCs that respect blocks
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.feed_page(
  p_before timestamptz default null,
  p_limit  int default 20,
  p_scope  text default 'all'      -- 'all' | 'following'
)
returns setof public.posts
language sql stable security definer set search_path = public
as $$
  select p.*
    from public.posts p
   where (p_before is null or p.created_at < p_before)
     and not exists (
       select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
           or (b.kind = 'block' and b.blocker_id = p.user_id and b.blocked_id = auth.uid())
     )
     and not exists (
       select 1 from public.bans bn
        where bn.user_id = p.user_id and (bn.expires_at is null or bn.expires_at > now())
     )
     and (
       p_scope <> 'following'
       or p.user_id = auth.uid()
       or exists (select 1 from public.follows f where f.follower_id = auth.uid() and f.following_id = p.user_id)
     )
   order by p.created_at desc
   limit least(coalesce(p_limit, 20), 50);
$$;

-- Suggested people for onboarding: most-followed, not already followed.
create or replace function public.suggested_profiles(p_tags text[] default '{}', p_limit int default 12)
returns table (
  id uuid, username text, display_name text, avatar_url text,
  bio text, tags text[], follower_count bigint
)
language sql stable security definer set search_path = public
as $$
  select pr.id, pr.username, pr.display_name, pr.avatar_url, pr.bio, pr.tags,
         count(f.follower_id) as follower_count
    from public.profiles pr
    left join public.follows f on f.following_id = pr.id
   where pr.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
     and pr.deleted_at is null
     and not exists (select 1 from public.follows mf where mf.follower_id = auth.uid() and mf.following_id = pr.id)
     and (coalesce(array_length(p_tags,1),0) = 0 or pr.tags && p_tags)
   group by pr.id
   order by count(f.follower_id) desc, pr.created_at desc
   limit least(coalesce(p_limit,12), 50);
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 11.  Guestbook throttle  (the one write path the first pass missed)
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.throttle_guestbook()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.enforce_rate_limit('guestbook', 'author_id', new.author_id, 10, 600);
  return new;
end;
$$;

drop trigger if exists trg_throttle_guestbook on public.guestbook;
create trigger trg_throttle_guestbook
  before insert on public.guestbook
  for each row execute function public.throttle_guestbook();

-- Guestbook entries should also respect blocks: someone you blocked must
-- not be able to write on your wall.
create or replace function public.guard_guestbook_block()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_blocked(new.profile_id, new.author_id) then
    raise exception 'BLOCKED: you cannot post to this profile' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_guestbook_block on public.guestbook;
create trigger trg_guard_guestbook_block
  before insert on public.guestbook
  for each row execute function public.guard_guestbook_block();

-- ─────────────────────────────────────────────────────────────────────
-- 12.  Reposts
-- ─────────────────────────────────────────────────────────────────────
-- A repost is just a post that points at another post. Storing it that
-- way means it flows through the feed, notifications, moderation and
-- deletion paths that already exist, with no parallel plumbing.

alter table public.posts add column if not exists repost_of uuid references public.posts(id) on delete cascade;
alter table public.posts add column if not exists repost_count int not null default 0;

create index if not exists posts_repost_of_idx on public.posts(repost_of) where repost_of is not null;

-- One plain (non-quote) repost per person per post.
create unique index if not exists posts_unique_plain_repost
  on public.posts(user_id, repost_of)
  where repost_of is not null and (body is null or body = '');

create or replace function public.sync_repost_count()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.repost_of is not null then
    update public.posts set repost_count = repost_count + 1 where id = new.repost_of;
  elsif tg_op = 'DELETE' and old.repost_of is not null then
    update public.posts set repost_count = greatest(0, repost_count - 1) where id = old.repost_of;
  end if;
  return null;
end;
$$;

drop trigger if exists trg_sync_repost_count on public.posts;
create trigger trg_sync_repost_count
  after insert or delete on public.posts
  for each row execute function public.sync_repost_count();

-- guard_post_counts() must protect repost_count too.
create or replace function public.guard_post_counts()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and current_setting('role', true) = 'authenticated' then
    new.like_count   := old.like_count;
    new.reply_count  := old.reply_count;
    new.repost_count := old.repost_count;
  end if;
  return new;
end;
$$;

create or replace function public.notify_on_repost()
returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid;
begin
  if new.repost_of is null then return null; end if;
  select user_id into owner_id from public.posts where id = new.repost_of;
  perform public.push_notification(owner_id, new.user_id, 'repost', new.id, 'post', left(coalesce(new.body,''), 140));
  return null;
end; $$;

drop trigger if exists trg_notify_repost on public.posts;
create trigger trg_notify_repost after insert on public.posts
  for each row execute function public.notify_on_repost();

-- Toggle a plain repost; quote-reposts (with a body) are ordinary inserts.
create or replace function public.toggle_repost(p_post_id uuid)
returns table (reposted boolean, repost_count int)
language plpgsql security definer set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existed boolean;
  src record;
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;

  select * into src from public.posts where id = p_post_id;
  if src is null then raise exception 'Post not found' using errcode = 'P0001'; end if;
  if src.repost_of is not null then
    -- Reposting a repost boosts the original instead of nesting.
    p_post_id := src.repost_of;
  end if;

  delete from public.posts
   where user_id = uid and repost_of = p_post_id and coalesce(body, '') = '';
  existed := found;

  if not existed then
    insert into public.posts (user_id, repost_of, body, post_type)
    values (uid, p_post_id, '', 'repost');
  end if;

  return query
    select (not existed), p.repost_count from public.posts p where p.id = p_post_id;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 13.  Web push subscriptions
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen  timestamptz not null default now()
);

create index if not exists push_subs_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push: owner all" on public.push_subscriptions;
create policy "push: owner all" on public.push_subscriptions
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────
-- 14.  Grants
-- ─────────────────────────────────────────────────────────────────────

grant execute on function
  public.toggle_like(uuid),
  public.toggle_repost(uuid),
  public.create_group(text, text, text[], text),
  public.request_account_deletion(),
  public.accept_terms(text),
  public.complete_onboarding(),
  public.mark_notifications_read(),
  public.resolve_report(uuid, text, text),
  public.open_report_count(),
  public.is_blocked(uuid, uuid),
  public.is_staff(),
  public.feed_page(timestamptz, int, text),
  public.suggested_profiles(text[], int)
to authenticated;

grant execute on function
  public.feed_page(timestamptz, int, text),
  public.suggested_profiles(text[], int)
to anon;

commit;

-- ═══════════════════════════════════════════════════════════════════════
--  POST-MIGRATION CHECKLIST (do these in the dashboard)
--
--  1. Auth → Providers → Email: decide on "Confirm email". The client now
--     handles both states, but pick one and test it.
--  2. Auth → URL Configuration → add your production URL + the reset
--     redirect (…/faero_v1_launch.html) to the allow-list, or the
--     "forgot password" link will bounce.
--  3. Cloudinary → Settings → Upload → preset `faero_unsigned`:
--       • Allowed formats: jpg,png,webp,gif
--       • Max file size: 8 MB
--       • Incoming transformation: c_limit,w_2000,h_2000,q_auto
--       • Enable "Unique filename" + a fixed folder
--  4. Run the RLS audit query below and eyeball every table.
-- ═══════════════════════════════════════════════════════════════════════

-- RLS audit — every public table should show rowsecurity = true and have
-- at least one policy. Anything with rowsecurity = false is world-writable.
--
--   select c.relname as table_name,
--          c.relrowsecurity as rls_enabled,
--          count(p.polname) as policies
--     from pg_class c
--     join pg_namespace n on n.oid = c.relnamespace
--     left join pg_policy p on p.polrelid = c.oid
--    where n.nspname = 'public' and c.relkind = 'r'
--    group by 1,2
--    order by rls_enabled, policies;
