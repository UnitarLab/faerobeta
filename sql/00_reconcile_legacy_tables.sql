-- ═══════════════════════════════════════════════════════════════════════
--  FAERO — reconcile pre-existing tables before the main migration
--
--  RUN THIS FIRST, then RUN_ME_ALL_IN_ONE.sql.
--
--  Why: replies, reports and groups already exist in this database from an
--  earlier schema. The main migration creates them with
--  `create table if not exists`, so Postgres skips them entirely and then
--  references columns that only exist in the newer definition. That is the
--  "column ... does not exist" (42703) error.
--
--  The columns that were actually missing, confirmed against the live
--  database before this file was written:
--
--    replies  : parent_id, edited_at
--    reports  : entity_id, entity_type, reason
--    groups   : image_url
--
--  reports.status / resolved_by / resolved_at / resolution_note and
--  groups.owner_id / slug / is_private / created_at are already handled by
--  `add column if not exists` inside the main migration, so they are not
--  repeated here.
--
--  Every statement is `add column if not exists`, so this is idempotent and
--  safe to run on a database that is already correct — it will simply do
--  nothing. It adds columns only; it never drops or rewrites data.
-- ═══════════════════════════════════════════════════════════════════════

begin;

-- Wrong-project guard, same as the main file.
do $guard$
begin
  if to_regclass('public.posts') is null or to_regclass('public.profiles') is null then
    raise exception using
      errcode = 'P0001',
      message = 'WRONG PROJECT — nothing was changed.',
      detail  = 'This database has no posts/profiles table, so it is not the Faero database.',
      hint    = 'The code after /project/ must be fifnkgpxtnmjycxkkqhz.';
  end if;
  raise notice 'Right project confirmed — reconciling legacy tables.';
end
$guard$;

-- ── replies ───────────────────────────────────────────────────────────
-- parent_id supports nested replies. The app does not use it yet, but the
-- migration indexes it, so the column has to exist.
alter table public.replies add column if not exists parent_id uuid;
alter table public.replies add column if not exists edited_at timestamptz;

-- Added separately: `add column if not exists` does not take a constraint
-- conditionally, and re-adding a foreign key that already exists is an error.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'replies_parent_id_fkey' and conrelid = 'public.replies'::regclass
  ) then
    alter table public.replies
      add constraint replies_parent_id_fkey
      foreign key (parent_id) references public.replies(id) on delete cascade;
  end if;
end $$;

-- ── reports ───────────────────────────────────────────────────────────
-- The old shape recorded only post_id. The moderation queue reads
-- entity_id/entity_type so it can handle reported replies and profiles too.
-- The main migration backfills entity_id from post_id once these exist.
alter table public.reports add column if not exists entity_id   uuid;
alter table public.reports add column if not exists entity_type text default 'post';
alter table public.reports add column if not exists reason      text;

-- ── groups ────────────────────────────────────────────────────────────
-- create_group() inserts image_url. Without this the migration succeeds and
-- then commons creation fails at runtime, which is a worse way to find out.
alter table public.groups add column if not exists image_url text;

commit;

-- ── What you should now have — all four rows must say present = true ──
select
  'replies.parent_id' as column_name,
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='replies' and column_name='parent_id') as present
union all select 'reports.entity_id',
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='reports' and column_name='entity_id')
union all select 'reports.entity_type',
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='reports' and column_name='entity_type')
union all select 'groups.image_url',
  exists (select 1 from information_schema.columns
           where table_schema='public' and table_name='groups' and column_name='image_url');
