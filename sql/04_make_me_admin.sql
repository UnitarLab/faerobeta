-- ═══════════════════════════════════════════════════════════════════════
--  FAERO — PROMOTE YOURSELF TO ADMIN
--
--  There is no separate admin account in Faero, and no admin password.
--  "Admin" is a flag on your own normal account. So:
--
--    1. Sign up in the app first, with your own email and your own password.
--    2. Change the email on both lines below to the one you signed up with.
--    3. Paste this whole file into Supabase → SQL Editor → Run.
--    4. Sign out and back in. The 👑 Mod Panel appears in your user menu.
--
--  Nobody — including whoever set this up for you — should ever know your
--  password. That is the whole point.
--
--  ── Two things this file used to get wrong ───────────────────────────
--
--  1. It used psql's `\set` to hold the email. The Supabase SQL Editor
--     talks straight to the server and rejects client metacommands, so it
--     errored before doing anything. The email is now typed in directly.
--
--  2. It ran a bare UPDATE, which SILENTLY DID NOTHING. File 06 installs
--     trg_guard_profile_privileges, a before-update trigger that reverts
--     `role` unless public.is_staff() is already true. In the SQL Editor
--     auth.uid() is NULL, so is_staff() is false, so the promotion was
--     undone with no error — the confirmation SELECT just kept saying
--     'member' with no explanation.
--
--     That is a bootstrap problem: you cannot become the first admin,
--     because changing a role requires already being staff. So the guard
--     is switched off for exactly one statement, inside a transaction.
--     If anything fails, the whole thing rolls back and the guard stays
--     enabled — it is never left disabled.
-- ═══════════════════════════════════════════════════════════════════════

begin;

alter table public.profiles disable trigger trg_guard_profile_privileges;

-- 👇 CHANGE THIS to the email you signed up with
update public.profiles p
   set role = 'admin'
  from auth.users u
 where u.id = p.id
   and lower(u.email) = lower('opalcrushsounds@gmail.com');

alter table public.profiles enable trigger trg_guard_profile_privileges;

commit;

-- Show the result so you can see it worked. `role` must say 'admin'.
-- 👇 AND CHANGE THIS ONE TOO
select
  p.username,
  p.display_name,
  p.role,
  u.email,
  case when u.email_confirmed_at is null
       then '⚠️  email not confirmed yet — confirm it before signing in'
       else '✅ confirmed' end as email_status,
  p.created_at
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('opalcrushsounds@gmail.com');

-- ── If it still says 'member' ─────────────────────────────────────────
-- The guard is not the only thing that can revert it. Check whether the
-- trigger really was disabled during the update:
--
--   select tgname, tgenabled from pg_trigger
--    where tgrelid = 'public.profiles'::regclass and not tgisinternal;
--
-- tgenabled 'O' = enabled (the correct resting state), 'D' = disabled.
-- If anything is left 'D', re-enable it:
--
--   alter table public.profiles enable trigger trg_guard_profile_privileges;
--
-- ── If the SELECT returned NO ROWS ────────────────────────────────────
-- That email has no account yet. Sign up in the app first, then re-run.
-- To see every account that does exist:
--
--   select p.username, p.display_name, p.role, u.email, p.created_at
--     from public.profiles p
--     join auth.users u on u.id = p.id
--    order by p.created_at
--    limit 50;
-- ═══════════════════════════════════════════════════════════════════════
