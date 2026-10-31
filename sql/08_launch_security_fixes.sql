-- ═══════════════════════════════════════════════════════════════════════
--  FAERO — LAUNCH SECURITY FIXES (run after RUN_ME_ALL_IN_ONE.sql)
--
--  Found by probing the LIVE project fifnkgpxtnmjycxkkqhz with only the
--  public anon key from the page source — i.e. what any visitor can do:
--
--    1. CRITICAL  rpc/request_account_deletion_for  → 204 for anon.
--       Anyone could erase ANY account (posts, DMs, follows, profile) by
--       passing its uuid, and every uuid is public in `profiles`.
--       Cause: 01 revoked EXECUTE from anon/authenticated but Postgres also
--       grants it to PUBLIC by default, and anon inherits PUBLIC.
--    2. HIGH      rpc/push_notification → 204 for anon. Forge a notification
--       to anyone, "from" anyone, with any text: phishing in the bell.
--    3. HIGH      followers-only posts were enforced in feed_page() only.
--       /rest/v1/posts returned them to everyone.
--    4. MEDIUM    mods could promote themselves (or anyone) to admin.
--    5. BUG       DMs: members could not see each other's membership row,
--                 so every conversation rendered as "Unknown", and "mark
--                 read" / last-message preview updates were silently
--                 refused (no UPDATE policy).
--
--  Part 1 is its own transaction ON PURPOSE: it is the urgent one and must
--  land even if something in Part 2 trips on a schema difference.
--  Idempotent — safe to run twice.
-- ═══════════════════════════════════════════════════════════════════════


-- ─────────────────────────────────────────────────────────────────────
--  PART 1 — internal functions are not callable from the API
-- ─────────────────────────────────────────────────────────────────────
-- Matched by name over pg_proc so every overload is covered and a missing
-- one is skipped instead of aborting. These are only ever called from
-- SECURITY DEFINER triggers/functions (which run as the owner) or from Edge
-- Functions holding the service role, so nothing legitimate loses access.
begin;

do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'request_account_deletion_for',   -- wipe any account
         'purge_deleted_accounts',          -- deletes from auth.users
         'push_notification',               -- forge notifications
         'enforce_rate_limit',              -- dynamic SQL helper
         'faero_unique_username',           -- signup helper
         'purge_old_client_errors'          -- deletes logs (cron only)
       )
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    execute format('grant execute on function %s to service_role', r.sig);
  end loop;
end $$;

-- Starting a DM needs a signed-in user. It is not in this repo's
-- migrations (it predates them), so it is handled by name as well.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'find_or_create_dm'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

commit;


-- ─────────────────────────────────────────────────────────────────────
--  PART 2 — privacy, privilege and DM policies
-- ─────────────────────────────────────────────────────────────────────
begin;

-- 3. Followers-only posts, enforced at the table rather than in one RPC.
create or replace function public.can_see_posts_of(p_owner uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select p_owner = auth.uid()
      or coalesce((select pr.post_privacy from public.profiles pr where pr.id = p_owner), 'all') <> 'followers'
      or exists (select 1 from public.follows f
                  where f.follower_id = auth.uid() and f.following_id = p_owner)
      or public.is_staff();
$$;
grant execute on function public.can_see_posts_of(uuid) to anon, authenticated;

drop policy if exists "posts: public read" on public.posts;
create policy "posts: public read" on public.posts
  for select using (
    not public.is_blocked(auth.uid(), user_id)
    and public.can_see_posts_of(user_id)
  );

-- 4. Only an admin may change anyone's role. Mods keep their other powers.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare caller_role text;
begin
  select role into caller_role from public.profiles where id = auth.uid();

  if coalesce(caller_role, '') not in ('admin', 'mod') then
    new.role            := old.role;
    new.is_og           := old.is_og;
    new.deleted_at      := old.deleted_at;
    new.follower_count  := old.follower_count;
    new.following_count := old.following_count;
    new.post_count      := old.post_count;
  elsif caller_role <> 'admin' then
    new.role := old.role;               -- a mod cannot mint admins or mods
  end if;
  return new;
end;
$$;

-- 5. DMs. A helper avoids RLS recursion on conversation_members.
create or replace function public.is_conversation_member(p_convo uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.conversation_members cm
                  where cm.conversation_id = p_convo and cm.user_id = auth.uid());
$$;
grant execute on function public.is_conversation_member(uuid) to authenticated;

do $$
begin
  if to_regclass('public.conversation_members') is not null then
    -- See everyone in a conversation you are in (needed to show who it's with).
    execute 'drop policy if exists "cm: own rows" on public.conversation_members';
    execute 'drop policy if exists "cm: members read" on public.conversation_members';
    execute 'create policy "cm: members read" on public.conversation_members
               for select using (public.is_conversation_member(conversation_id))';

    -- Update only your own row, and only unread_count. The column grant is
    -- what matters: without it, "update my own row" would let you rewrite
    -- conversation_id and join someone else's conversation.
    execute 'drop policy if exists "cm: own unread" on public.conversation_members';
    execute 'create policy "cm: own unread" on public.conversation_members
               for update using (user_id = auth.uid()) with check (user_id = auth.uid())';
    execute 'revoke update on public.conversation_members from anon, authenticated';
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'conversation_members'
                  and column_name = 'unread_count') then
      execute 'grant update (unread_count) on public.conversation_members to authenticated';
    end if;
  end if;

  if to_regclass('public.conversations') is not null then
    execute 'drop policy if exists "convos: members update preview" on public.conversations';
    execute 'create policy "convos: members update preview" on public.conversations
               for update using (public.is_conversation_member(id))
               with check (public.is_conversation_member(id))';
    execute 'revoke update on public.conversations from anon, authenticated';
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'conversations'
                  and column_name = 'last_message_body')
       and exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'conversations'
                  and column_name = 'last_message_at') then
      execute 'grant update (last_message_body, last_message_at) on public.conversations to authenticated';
    end if;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';



-- ─────────────────────────────────────────────────────────────────────
--  PART 3 — gaps found walking the user journey end to end
-- ─────────────────────────────────────────────────────────────────────
begin;

-- 6. Consent at signup. With email confirmation ON the client never has a
--    session, so accept_terms() was never called and new users hit the
--    "our terms have changed" gate on their second visit. The checkboxes
--    were ticked at signup and travel in the metadata; record them here.
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

  if nullif(new.raw_user_meta_data->>'tos_version', '') is not null
     and coalesce((new.raw_user_meta_data->>'age_confirmed')::boolean, false) then
    update public.profiles
       set tos_version     = new.raw_user_meta_data->>'tos_version',
           tos_accepted_at = now(),
           dob_confirmed   = true
     where id = new.id;
  end if;

  return new;
end;
$$;

-- 7. Status: shown on every profile, now editable from Edit profile.
alter table public.profiles add column if not exists status text;
-- The trigger below reads these; they predate the repo's migrations, so make
-- sure they exist or every profile update would fail inside the trigger.
alter table public.profiles add column if not exists bio      text;
alter table public.profiles add column if not exists location text;
alter table public.profiles add column if not exists website  text;

-- 8. Profile fields are validated when they CHANGE. A CHECK constraint
--    would also reject legacy rows on any unrelated update (a user with an
--    old odd username could no longer save their bio).
create or replace function public.validate_profile_fields()
returns trigger
language plpgsql
as $$
begin
  if new.username is distinct from old.username
     and new.username !~ '^[a-z0-9._]{2,24}$' then
    raise exception 'Usernames are 2-24 characters: lowercase letters, numbers, dots and underscores.'
      using errcode = '23514';
  end if;
  if new.display_name is distinct from old.display_name and length(new.display_name) > 50 then
    raise exception 'Display name is too long (50 max).' using errcode = '23514';
  end if;
  if new.bio is distinct from old.bio and length(new.bio) > 200 then
    raise exception 'Bio is too long (200 max).' using errcode = '23514';
  end if;
  if new.status is distinct from old.status and length(new.status) > 80 then
    raise exception 'Status is too long (80 max).' using errcode = '23514';
  end if;
  if new.location is distinct from old.location and length(new.location) > 60 then
    raise exception 'Location is too long (60 max).' using errcode = '23514';
  end if;
  if new.website is distinct from old.website and coalesce(new.website, '') <> ''
     and (length(new.website) > 200 or new.website !~* '^https?://') then
    raise exception 'Website must be an http(s) link under 200 characters.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_profile_fields on public.profiles;
create trigger trg_validate_profile_fields
  before update on public.profiles
  for each row execute function public.validate_profile_fields();

-- 9. Length caps on everything people type. NOT VALID: checked on new
--    inserts/updates only, existing rows are left alone. Without them the
--    API accepts a megabyte "post" and every reader downloads it.
do $$
declare t record;
begin
  for t in select * from (values
      ('posts',     'body', 5000),
      ('replies',   'body', 2000),
      ('guestbook', 'body',  500),
      ('messages',  'body', 4000)
    ) as v(tbl, col, maxlen)
  loop
    if exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = t.tbl and column_name = t.col)
       and not exists (select 1 from pg_constraint
                        where conname = t.tbl || '_' || t.col || '_len') then
      execute format('alter table public.%I add constraint %I check (length(%I) <= %s) not valid',
                     t.tbl, t.tbl || '_' || t.col || '_len', t.col, t.maxlen);
    end if;
  end loop;
end $$;

-- 10. DMs, server side. Nothing ever incremented the recipient's
--     unread_count, so the unread badge never lit up, and the conversation
--     preview depended on the sender's browser finishing a second request.
create or replace function public.on_message_sent()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.conversation_members
     set unread_count = coalesce(unread_count, 0) + 1
   where conversation_id = new.conversation_id
     and user_id <> new.sender_id;

  update public.conversations
     set last_message_body = left(new.body, 200),
         last_message_at   = coalesce(new.created_at, now())
   where id = new.conversation_id;
  return new;
end;
$$;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'conversation_members' and column_name = 'unread_count')
     and exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'conversations' and column_name = 'last_message_body')
     and exists (select 1 from information_schema.columns where table_schema = 'public'
              and table_name = 'messages' and column_name = 'body') then
    execute 'drop trigger if exists trg_on_message_sent on public.messages';
    execute 'create trigger trg_on_message_sent after insert on public.messages
               for each row execute function public.on_message_sent()';
  else
    raise notice 'DM columns differ from expected - unread counter trigger not installed';
  end if;
end $$;

-- 11. Someone signing your guestbook now tells you.
create or replace function public.notify_guestbook()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.author_id is distinct from new.profile_id then
    perform public.push_notification(new.profile_id, new.author_id, 'guestbook',
                                     new.profile_id, 'profile', left(new.body, 140));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_notify_guestbook on public.guestbook;
create trigger trg_notify_guestbook after insert on public.guestbook
  for each row execute function public.notify_guestbook();

-- 12. Live updates. The app subscribes to these tables; if they are not in
--     the realtime publication, DMs and notifications only appear on reload.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['messages', 'conversations', 'notifications', 'posts'] loop
      if to_regclass('public.' || t) is not null
         and not exists (select 1 from pg_publication_tables
                          where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────
--  VERIFY — every row must say ✅
-- ─────────────────────────────────────────────────────────────────────
select p.oid::regprocedure::text as function,
       case when has_function_privilege('anon', p.oid, 'execute')
            then '❌ STILL CALLABLE BY ANYONE' else '✅ locked' end as anon,
       case when has_function_privilege('authenticated', p.oid, 'execute')
                 and p.proname <> 'find_or_create_dm'
            then '❌ callable by any user' else '✅' end as authenticated
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in ('request_account_deletion_for','purge_deleted_accounts',
                     'push_notification','enforce_rate_limit','faero_unique_username',
                     'purge_old_client_errors','find_or_create_dm')
 order by 2 desc, 1;
