-- ════════════════════════════════════════════════════════════════════
--  11 — Make account deletion actually mark the account deleted
--
--  The bug: guard_profile_privileges() (06) protects columns a person must
--  not edit on their own row, and deleted_at is one of them. It runs on
--  every UPDATE and resets deleted_at unless the caller is admin/mod. The
--  deletion functions (01) are security definer, but auth.uid() is still
--  the person deleting, so the guard undid their `deleted_at = now()`.
--  Result: deletion blanked the profile but never marked it deleted, so
--  purge_deleted_accounts() never found it and the scrub trigger from 10
--  never fired.
--
--  The fix: the deletion functions raise a transaction-local flag, and the
--  guard lets deleted_at change only while that flag is up. PostgREST runs
--  every request in its own transaction and does not expose set_config, so
--  nobody can raise the flag from the API. The deletion functions also now
--  clear the columns added after 01 themselves (status, pronouns, links,
--  profile background, pinned post, profile space), so they don't depend on
--  the trigger in 10 alone.
--
--  Idempotent. Run after 10_scrub_deleted_profiles.sql.
-- ════════════════════════════════════════════════════════════════════

create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
as $$
declare caller_role text;
begin
  select role into caller_role from public.profiles where id = auth.uid();

  if coalesce(caller_role, '') not in ('admin', 'mod') then
    new.role            := old.role;
    new.is_og           := old.is_og;
    new.follower_count  := old.follower_count;
    new.following_count := old.following_count;
    new.post_count      := old.post_count;
    -- Only the account-deletion functions may set deleted_at.
    if coalesce(current_setting('faero.deleting', true), '') <> 'on' then
      new.deleted_at := old.deleted_at;
    end if;
  elsif caller_role <> 'admin' then
    new.role := old.role;               -- a mod cannot mint admins or mods
  end if;
  return new;
end;
$$;

create or replace function public.request_account_deletion()
returns void
language plpgsql security definer set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'AUTH_REQUIRED' using errcode = 'P0001'; end if;
  perform set_config('faero.deleting', 'on', true);   -- see guard_profile_privileges

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
         status = null, pronouns = null, links = '{}'::jsonb,
         profile_bg_url = null, pinned_post_id = null, space = null,
         deleted_at = now()
   where id = uid;
end;
$$;

create or replace function public.request_account_deletion_for(p_uid uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  perform set_config('faero.deleting', 'on', true);   -- see guard_profile_privileges

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
         status = null, pronouns = null, links = '{}'::jsonb,
         profile_bg_url = null, pinned_post_id = null, space = null,
         deleted_at = now()
   where id = p_uid;
end;
$$;

revoke execute on function public.request_account_deletion_for(uuid) from anon, authenticated;
