-- ═══════════════════════════════════════════════════════════════════════
-- 07 — client error log
--
-- Backing table for the log-error Edge Function. Idempotent: safe to re-run.
--
-- Run this BEFORE deploying the function, or the first inserts fail with
-- "relation public.client_errors does not exist".
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.client_errors (
  id          bigserial primary key,
  created_at  timestamptz  not null default now(),
  kind        text         not null,
  detail      text,
  build       text,
  page        text,
  user_agent  text,
  -- Claimed by the client, so it is a grouping hint and nothing more. No FK:
  -- a report from a user who has since deleted their account is still a
  -- valid report, and cascading it away would delete evidence.
  user_id     uuid
);

create index if not exists client_errors_created_idx on public.client_errors (created_at desc);
create index if not exists client_errors_kind_idx    on public.client_errors (kind, created_at desc);

-- RLS on, with no policy for anon or authenticated. The Edge Function writes
-- with the service role, which bypasses RLS; nobody else reads or writes.
-- Error reports carry user agents, page paths and user ids — that is not
-- public data.
alter table public.client_errors enable row level security;

-- Staff can read them from the ops console.
drop policy if exists client_errors_staff_read on public.client_errors;
create policy client_errors_staff_read on public.client_errors
  for select using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('admin', 'moderator')
    )
  );

-- ── Retention ─────────────────────────────────────────────────────────
-- Error logs are diagnostic, not archival, and PRIVACY_POLICY.md commits to
-- keeping diagnostic data no longer than needed. Without this the table
-- grows forever and quietly becomes a personal-data liability.
create or replace function public.purge_old_client_errors()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.client_errors where created_at < now() - interval '30 days';
$$;

comment on function public.purge_old_client_errors is
  'Deletes client error reports older than 30 days. Schedule daily via pg_cron.';

-- Schedule it if pg_cron is available (Database → Extensions → pg_cron).
-- Wrapped so this file still runs cleanly on projects without the extension.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('faero-purge-client-errors')
      where exists (select 1 from cron.job where jobname = 'faero-purge-client-errors');
    perform cron.schedule(
      'faero-purge-client-errors',
      '17 4 * * *',
      $cron$ select public.purge_old_client_errors(); $cron$
    );
  else
    raise notice 'pg_cron not installed — enable it and re-run this file, or call purge_old_client_errors() yourself.';
  end if;
end $$;

-- ── Verify ────────────────────────────────────────────────────────────
select
  (select count(*) from pg_policies where tablename = 'client_errors') as policies,
  (select relrowsecurity from pg_class where relname = 'client_errors') as rls_enabled;
