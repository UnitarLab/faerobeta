-- ═══════════════════════════════════════════════════════════════════════
--  FAERO — HARDENING PASS (run after 01)
--
--  Closes gaps found auditing the app for public signup:
--
--    A. reports.post_id / entity_id mismatch + no reason recorded
--    B. privacy settings ("who can DM me", "who can see my posts") were
--       stored in localStorage only — per-device, unenforced, a lie
--    C. blocks were enforced in the feed but NOT in DMs or follows
--    D. no server-side guard on conversation membership
--
--  Idempotent and wrapped in a transaction, same as 01.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────
-- A.  Reports — accept both column shapes, and record a reason
-- ─────────────────────────────────────────────────────────────────────
-- The client used to insert `post_id`; the queue reads `entity_id`. Keep
-- post_id as a real column so old rows survive, and backfill entity_id
-- from it so nothing reported is invisible to moderators.

alter table public.reports add column if not exists post_id uuid;

update public.reports
   set entity_id   = post_id,
       entity_type = coalesce(entity_type, 'post')
 where entity_id is null and post_id is not null;

-- Keep the two in sync from now on, whichever one the client sends.
create or replace function public.sync_report_entity()
returns trigger
language plpgsql
as $$
begin
  if new.entity_id is null and new.post_id is not null then
    new.entity_id   := new.post_id;
    new.entity_type := coalesce(new.entity_type, 'post');
  elsif new.post_id is null and new.entity_id is not null
        and coalesce(new.entity_type, 'post') = 'post' then
    new.post_id := new.entity_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_report_entity on public.reports;
create trigger trg_sync_report_entity
  before insert or update on public.reports
  for each row execute function public.sync_report_entity();

-- One open report per person per item — stops a pile-up from one user
-- without blocking a genuine second report after the first is resolved.
create unique index if not exists reports_one_open_per_reporter
  on public.reports (reporter_id, entity_id)
  where status in ('open', 'reviewing');

-- Rate limit: 20 reports / hour.
create or replace function public.throttle_reports()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.enforce_rate_limit('reports', 'reporter_id', new.reporter_id, 20, 3600);
  return new;
end;
$$;

drop trigger if exists trg_throttle_reports on public.reports;
create trigger trg_throttle_reports
  before insert on public.reports
  for each row execute function public.throttle_reports();

-- ─────────────────────────────────────────────────────────────────────
-- B.  Privacy settings that actually bind
-- ─────────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists dm_privacy text not null default 'all'
    check (dm_privacy in ('all', 'followers', 'none'));

alter table public.profiles
  add column if not exists post_privacy text not null default 'all'
    check (post_privacy in ('all', 'followers'));

alter table public.profiles
  add column if not exists show_activity boolean not null default true;

-- May `sender` message `recipient`, given the recipient's setting?
create or replace function public.can_dm(sender uuid, recipient uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select case
    when sender is null or recipient is null then false
    when sender = recipient                  then true
    when public.is_blocked(sender, recipient) then false
    else coalesce((
      select case pr.dm_privacy
        when 'none'      then false
        when 'followers' then exists (
          select 1 from public.follows f
           where f.follower_id = recipient and f.following_id = sender)
        else true
      end
      from public.profiles pr where pr.id = recipient
    ), true)
  end;
$$;

-- Enforced on the way in, so it holds no matter which client is calling.
create or replace function public.guard_message_send()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare other uuid;
begin
  for other in
    select cm.user_id
      from public.conversation_members cm
     where cm.conversation_id = new.conversation_id
       and cm.user_id <> new.sender_id
  loop
    if not public.can_dm(new.sender_id, other) then
      raise exception 'DM_NOT_ALLOWED: this person is not accepting messages from you'
        using errcode = 'P0001';
    end if;
  end loop;
  return new;
end;
$$;

-- Only wire it if conversation_members exists — some schemas differ.
do $$
begin
  if to_regclass('public.conversation_members') is not null then
    execute 'drop trigger if exists trg_guard_message_send on public.messages';
    execute 'create trigger trg_guard_message_send
               before insert on public.messages
               for each row execute function public.guard_message_send()';
  else
    raise notice 'conversation_members not found — DM privacy guard not installed';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- C.  Blocks bind on follows too
-- ─────────────────────────────────────────────────────────────────────
-- 01 deleted existing follows when a block was created, but nothing
-- stopped the blocked person following straight back.

create or replace function public.guard_follow()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.follower_id = new.following_id then
    raise exception 'You cannot follow yourself' using errcode = 'P0001';
  end if;
  if public.is_blocked(new.follower_id, new.following_id) then
    raise exception 'BLOCKED: you cannot follow this person' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_follow on public.follows;
create trigger trg_guard_follow
  before insert on public.follows
  for each row execute function public.guard_follow();

-- Rate limit follows too: 100/hour stops follow-spam bots.
create or replace function public.throttle_follows()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  perform public.enforce_rate_limit('follows', 'follower_id', new.follower_id, 100, 3600);
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'follows'
                and column_name = 'created_at') then
    execute 'drop trigger if exists trg_throttle_follows on public.follows';
    execute 'create trigger trg_throttle_follows
               before insert on public.follows
               for each row execute function public.throttle_follows()';
  else
    raise notice 'follows.created_at missing — follow throttle not installed';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────
-- D.  Post visibility respects post_privacy
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.feed_page(
  p_before timestamptz default null,
  p_limit  int default 20,
  p_scope  text default 'all'
)
returns setof public.posts
language sql stable security definer set search_path = public
as $$
  select p.*
    from public.posts p
    join public.profiles pr on pr.id = p.user_id
   where (p_before is null or p.created_at < p_before)
     and pr.deleted_at is null
     and not exists (
       select 1 from public.blocks b
        where (b.blocker_id = auth.uid() and b.blocked_id = p.user_id)
           or (b.kind = 'block' and b.blocker_id = p.user_id and b.blocked_id = auth.uid())
     )
     and not exists (
       select 1 from public.bans bn
        where bn.user_id = p.user_id and (bn.expires_at is null or bn.expires_at > now())
     )
     -- followers-only posts are visible to the author and their followers
     and (
       pr.post_privacy <> 'followers'
       or p.user_id = auth.uid()
       or exists (select 1 from public.follows f
                   where f.follower_id = auth.uid() and f.following_id = p.user_id)
     )
     and (
       p_scope <> 'following'
       or p.user_id = auth.uid()
       or exists (select 1 from public.follows f
                   where f.follower_id = auth.uid() and f.following_id = p.user_id)
     )
   order by p.created_at desc
   limit least(coalesce(p_limit, 20), 50);
$$;

grant execute on function
  public.can_dm(uuid, uuid),
  public.feed_page(timestamptz, int, text)
to authenticated;

grant execute on function public.feed_page(timestamptz, int, text) to anon;

commit;

-- ═══════════════════════════════════════════════════════════════════════
--  Verify (read-only, run separately)
--
--    select 'reports.post_id'   as item,
--           case when to_regclass('public.reports') is not null
--                 and exists (select 1 from information_schema.columns
--                              where table_name='reports' and column_name='post_id')
--                then 'OK' else 'MISSING' end as status
--    union all select 'profiles.dm_privacy',
--           case when exists (select 1 from information_schema.columns
--                              where table_name='profiles' and column_name='dm_privacy')
--                then 'OK' else 'MISSING' end
--    union all select 'trigger: guard_follow',
--           case when exists (select 1 from pg_trigger where tgname='trg_guard_follow')
--                then 'OK' else 'MISSING' end
--    union all select 'trigger: guard_message_send',
--           case when exists (select 1 from pg_trigger where tgname='trg_guard_message_send')
--                then 'OK' else 'NOT INSTALLED (check notice)' end;
-- ═══════════════════════════════════════════════════════════════════════
