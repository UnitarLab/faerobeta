-- ═══════════════════════════════════════════════════════════════════════
--  FAERO — ROW LEVEL SECURITY ON THE PRE-EXISTING TABLES
--
--  WHY THIS EXISTS
--  01_beta_launch_migration.sql enables RLS on the tables it creates
--  (replies, blocks, bookmarks, notifications, reports, push_subscriptions)
--  but it deliberately never touched the tables that already existed —
--  posts, profiles, likes, follows, messages, guestbook, group_members,
--  bans, conversations.
--
--  If those tables have RLS off, your public anon key lets ANYONE:
--    • delete or deface any post           • forge likes and follows
--    • read every direct message           • promote themselves to admin
--    • lift the whole user table
--
--  A penetration test against a database in that state deleted another
--  user's post on the first attempt. This is a launch blocker.
--
--  SAFETY
--  Policies are created BEFORE `enable row level security` in the same
--  transaction, so there is never a window where the tables are on but
--  unreadable. If anything fails the whole thing rolls back.
--
--  Run 02_verify_after.sql afterwards — every RLS row should read ✅.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- ─────────────────────────────────────────────────────────────────────
--  profiles — world readable, you may only edit your own, and you may
--  never edit the fields that grant power.
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "profiles: public read"   on public.profiles;
drop policy if exists "profiles: owner updates" on public.profiles;
drop policy if exists "profiles: staff updates" on public.profiles;

create policy "profiles: public read" on public.profiles
  for select using (true);

create policy "profiles: owner updates" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles: staff updates" on public.profiles
  for update using (public.is_staff());

-- No insert policy: profiles are created by the handle_new_user trigger.
-- No delete policy: deletion goes through request_account_deletion().

-- Privilege fields are not editable by their owner. Without this, the
-- "owner updates" policy above would happily let anyone set role='admin'.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if public.is_staff() then
    return new;                       -- moderators may change roles
  end if;
  new.role          := old.role;
  new.is_og         := old.is_og;
  new.deleted_at    := old.deleted_at;
  new.follower_count  := old.follower_count;
  new.following_count := old.following_count;
  new.post_count      := old.post_count;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_privileges on public.profiles;
create trigger trg_guard_profile_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

alter table public.profiles enable row level security;

-- ─────────────────────────────────────────────────────────────────────
--  posts — readable by all, writable only by their author.
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "posts: public read"    on public.posts;
drop policy if exists "posts: author inserts" on public.posts;
drop policy if exists "posts: author updates" on public.posts;
drop policy if exists "posts: author deletes" on public.posts;

create policy "posts: public read" on public.posts
  for select using (
    not public.is_blocked(auth.uid(), user_id)
  );

create policy "posts: author inserts" on public.posts
  for insert with check (
    user_id = auth.uid()
    and not exists (
      select 1 from public.bans b
       where b.user_id = auth.uid()
         and (b.expires_at is null or b.expires_at > now())
    )
  );

create policy "posts: author updates" on public.posts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "posts: author deletes" on public.posts
  for delete using (user_id = auth.uid() or public.is_staff());

alter table public.posts enable row level security;

-- ─────────────────────────────────────────────────────────────────────
--  likes / follows — you may only act as yourself.
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "likes: public read"  on public.likes;
drop policy if exists "likes: own insert"   on public.likes;
drop policy if exists "likes: own delete"   on public.likes;

create policy "likes: public read" on public.likes for select using (true);
create policy "likes: own insert"  on public.likes for insert with check (user_id = auth.uid());
create policy "likes: own delete"  on public.likes for delete using (user_id = auth.uid());

alter table public.likes enable row level security;

drop policy if exists "follows: public read" on public.follows;
drop policy if exists "follows: own insert"  on public.follows;
drop policy if exists "follows: own delete"  on public.follows;

create policy "follows: public read" on public.follows for select using (true);

create policy "follows: own insert" on public.follows
  for insert with check (
    follower_id = auth.uid()
    and following_id <> auth.uid()                       -- no self-follow
    and not public.is_blocked(auth.uid(), following_id)  -- blocks hold
  );

create policy "follows: own delete" on public.follows
  for delete using (follower_id = auth.uid() or following_id = auth.uid());

alter table public.follows enable row level security;

-- ─────────────────────────────────────────────────────────────────────
--  guestbook — public wall, but only the author or the wall's owner
--  may remove an entry.
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "guestbook: public read" on public.guestbook;
drop policy if exists "guestbook: own insert"  on public.guestbook;
drop policy if exists "guestbook: owner or author deletes" on public.guestbook;

create policy "guestbook: public read" on public.guestbook for select using (true);

create policy "guestbook: own insert" on public.guestbook
  for insert with check (
    author_id = auth.uid()
    and not public.is_blocked(auth.uid(), profile_id)
    and not exists (
      select 1 from public.bans b
       where b.user_id = auth.uid()
         and (b.expires_at is null or b.expires_at > now())
    )
  );

create policy "guestbook: owner or author deletes" on public.guestbook
  for delete using (author_id = auth.uid() or profile_id = auth.uid() or public.is_staff());

alter table public.guestbook enable row level security;

-- ─────────────────────────────────────────────────────────────────────
--  group_members — join and leave yourself; owners may remove others.
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "gm: public read"  on public.group_members;
drop policy if exists "gm: self join"    on public.group_members;
drop policy if exists "gm: self or owner removes" on public.group_members;

create policy "gm: public read" on public.group_members for select using (true);
create policy "gm: self join"   on public.group_members for insert with check (user_id = auth.uid());

create policy "gm: self or owner removes" on public.group_members
  for delete using (
    user_id = auth.uid()
    or public.is_staff()
    or exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid())
  );

alter table public.group_members enable row level security;

-- ─────────────────────────────────────────────────────────────────────
--  bans — moderation records. Users may see their own ban (so the app
--  can explain why they're restricted) and nothing else.
-- ─────────────────────────────────────────────────────────────────────
drop policy if exists "bans: self or staff read" on public.bans;
drop policy if exists "bans: staff writes"       on public.bans;
drop policy if exists "bans: staff updates"      on public.bans;
drop policy if exists "bans: staff deletes"      on public.bans;

create policy "bans: self or staff read" on public.bans
  for select using (user_id = auth.uid() or public.is_staff());
create policy "bans: staff writes"  on public.bans for insert with check (public.is_staff());
create policy "bans: staff updates" on public.bans for update using (public.is_staff());
create policy "bans: staff deletes" on public.bans for delete using (public.is_staff());

alter table public.bans enable row level security;

-- ─────────────────────────────────────────────────────────────────────
--  messages / conversations — participants only.
--  Written defensively: schemas differ, so only apply what fits yours.
-- ─────────────────────────────────────────────────────────────────────
do $$
declare
  has_members boolean := to_regclass('public.conversation_members') is not null;
begin
  if to_regclass('public.messages') is null then
    raise notice 'messages table not found — skipping';
    return;
  end if;

  execute 'drop policy if exists "messages: participants read" on public.messages';
  execute 'drop policy if exists "messages: sender inserts"    on public.messages';
  execute 'drop policy if exists "messages: sender deletes"    on public.messages';

  if has_members then
    execute $p$
      create policy "messages: participants read" on public.messages
        for select using (
          exists (select 1 from public.conversation_members cm
                   where cm.conversation_id = messages.conversation_id
                     and cm.user_id = auth.uid())
        )$p$;
    execute $p$
      create policy "messages: sender inserts" on public.messages
        for insert with check (
          sender_id = auth.uid()
          and exists (select 1 from public.conversation_members cm
                       where cm.conversation_id = messages.conversation_id
                         and cm.user_id = auth.uid())
        )$p$;
  else
    -- No membership table: fall back to sender-only visibility. Tighten
    -- this once conversation_members exists, or DMs stay half-private.
    raise notice 'conversation_members not found — messages restricted to sender only';
    execute 'create policy "messages: participants read" on public.messages
               for select using (sender_id = auth.uid())';
    execute 'create policy "messages: sender inserts" on public.messages
               for insert with check (sender_id = auth.uid())';
  end if;

  execute 'create policy "messages: sender deletes" on public.messages
             for delete using (sender_id = auth.uid())';
  execute 'alter table public.messages enable row level security';

  if to_regclass('public.conversation_members') is not null then
    execute 'drop policy if exists "cm: own rows" on public.conversation_members';
    execute 'create policy "cm: own rows" on public.conversation_members
               for select using (user_id = auth.uid())';
    execute 'alter table public.conversation_members enable row level security';
  end if;

  if to_regclass('public.conversations') is not null then
    execute 'drop policy if exists "convos: participants read" on public.conversations';
    if has_members then
      execute $p$
        create policy "convos: participants read" on public.conversations
          for select using (
            exists (select 1 from public.conversation_members cm
                     where cm.conversation_id = conversations.id
                       and cm.user_id = auth.uid())
          )$p$;
    else
      execute 'create policy "convos: participants read" on public.conversations
                 for select using (auth.uid() is not null)';
    end if;
    execute 'alter table public.conversations enable row level security';
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────
--  groups — already handled in 01, but make sure RLS is actually on.
-- ─────────────────────────────────────────────────────────────────────
alter table public.groups enable row level security;

commit;

-- ── After running this ────────────────────────────────────────────────
--  1. Run 02_verify_after.sql — no row should say "RLS OFF".
--  2. Open the app and check you can still post, like, follow and DM.
--     If something stopped working, it means a policy is too tight —
--     tell me which action failed rather than disabling RLS again.
-- ═══════════════════════════════════════════════════════════════════════
