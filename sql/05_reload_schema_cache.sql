-- ═══════════════════════════════════════════════════════════════════════
--  FAERO — RELOAD THE API SCHEMA CACHE
--
--  Symptom this fixes:
--    • "column posts.reply_count does not exist"        (code 42703)
--    • "Could not find the function public.xxx in the
--       schema cache"                                   (code PGRST202)
--    • The app logs "running in pre-migration compatibility mode"
--      even though you already ran 01_beta_launch_migration.sql
--
--  Why it happens:
--    Supabase's API layer (PostgREST) serves your tables from an in-memory
--    snapshot of the schema. After a big migration that snapshot can lag,
--    so the database has the new columns and functions but the API still
--    insists they don't exist. Nothing is broken — the cache is just old.
--
--  Paste this into Supabase → SQL Editor → Run, then hard-refresh the app
--  (Ctrl+Shift+R). Takes a couple of seconds to take effect.
-- ═══════════════════════════════════════════════════════════════════════

notify pgrst, 'reload schema';

-- Prove the objects really are in the database, cache or no cache.
-- Every row below should say ✅. If any say ❌, the cache was NOT the
-- problem — re-run 01_beta_launch_migration.sql instead (it is idempotent).

select 'posts.reply_count'   as object,
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='posts'
                            and column_name='reply_count')
            then '✅ in database' else '❌ genuinely missing' end as verdict
union all
select 'posts.repost_count',
       case when exists (select 1 from information_schema.columns
                          where table_schema='public' and table_name='posts'
                            and column_name='repost_count')
            then '✅ in database' else '❌ genuinely missing' end
union all
select 'function open_report_count',
       case when exists (select 1 from pg_proc
                          where proname='open_report_count'
                            and pronamespace='public'::regnamespace)
            then '✅ in database' else '❌ genuinely missing' end
union all
select 'function toggle_like',
       case when exists (select 1 from pg_proc
                          where proname='toggle_like'
                            and pronamespace='public'::regnamespace)
            then '✅ in database' else '❌ genuinely missing' end
union all
select 'table replies',
       case when to_regclass('public.replies') is not null
            then '✅ in database' else '❌ genuinely missing' end;

-- ── If reloading didn't help ──────────────────────────────────────────
-- Supabase Dashboard → Settings → General → Restart project. That forces
-- a cold rebuild of the cache. It causes ~20 seconds of downtime.
-- ═══════════════════════════════════════════════════════════════════════
