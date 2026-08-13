-- ═══════════════════════════════════════════════════════════════════════
--  FAERO — repair the legacy set_updated_at() triggers
--
--  RUN AFTER 00_reconcile_legacy_tables.sql, BEFORE RUN_ME_ALL_IN_ONE.sql.
--
--  Symptom: ERROR 42703: record "new" has no field "updated_at"
--           PL/pgSQL function set_updated_at() line 2
--
--  set_updated_at() is pre-existing in this database — it appears nowhere
--  in the Faero migration. It has been attached to one or more tables that
--  have no updated_at column, which means every UPDATE on those tables has
--  been failing since the trigger was created. The migration is simply the
--  first thing to attempt one.
--
--  Only profiles and groups had updated_at when this was written.
--
--  This adds the missing column to exactly the tables that carry the
--  trigger, so the trigger does what it was written to do, rather than
--  dropping behaviour someone deliberately added. Idempotent.
-- ═══════════════════════════════════════════════════════════════════════

-- First: look at what is actually broken, before changing anything.
select
  c.relname                                        as table_name,
  t.tgname                                         as trigger_name,
  exists (
    select 1 from pg_attribute a
    where a.attrelid = c.oid and a.attname = 'updated_at'
      and a.attnum > 0 and not a.attisdropped
  )                                                as has_updated_at,
  case when exists (
    select 1 from pg_attribute a
    where a.attrelid = c.oid and a.attname = 'updated_at'
      and a.attnum > 0 and not a.attisdropped
  ) then '✅ fine' else '❌ every UPDATE on this table fails' end as verdict
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc  p on p.oid = t.tgfoid
where not t.tgisinternal
  and p.proname = 'set_updated_at'
  and c.relnamespace = 'public'::regnamespace
order by has_updated_at, c.relname;

-- Then: add the column wherever it is missing.
do $$
declare
  r record;
begin
  for r in
    select distinct c.relname
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_proc  p on p.oid = t.tgfoid
    where not t.tgisinternal
      and p.proname = 'set_updated_at'
      and c.relnamespace = 'public'::regnamespace
      and not exists (
        select 1 from pg_attribute a
        where a.attrelid = c.oid and a.attname = 'updated_at'
          and a.attnum > 0 and not a.attisdropped
      )
  loop
    execute format(
      'alter table public.%I add column updated_at timestamptz not null default now()',
      r.relname
    );
    raise notice 'added updated_at to public.% (its set_updated_at trigger was broken)', r.relname;
  end loop;
end $$;

-- Confirm: every row must now say has_updated_at = true.
select
  c.relname as table_name,
  exists (
    select 1 from pg_attribute a
    where a.attrelid = c.oid and a.attname = 'updated_at'
      and a.attnum > 0 and not a.attisdropped
  ) as has_updated_at
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc  p on p.oid = t.tgfoid
where not t.tgisinternal
  and p.proname = 'set_updated_at'
  and c.relnamespace = 'public'::regnamespace
group by c.relname, c.oid
order by c.relname;
