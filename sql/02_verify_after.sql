-- ═══════════════════════════════════════════════════════════════════════
--  FAERO — MIGRATION VERIFIER
--
--  Paste this whole file into Supabase → SQL Editor → Run.
--  It changes nothing. It just tells you exactly what is present and what
--  is missing, one row per thing, with a PASS / MISSING verdict.
--
--  Anything that says MISSING means beta_launch_migration.sql did not
--  fully apply — re-run it (it is idempotent and safe to re-run).
-- ═══════════════════════════════════════════════════════════════════════

with expected_tables(name) as (values
  ('replies'), ('blocks'), ('bookmarks'), ('notifications'),
  ('reports'), ('push_subscriptions')
  -- Note: reposts are NOT a table. A repost is a row in `posts` with
  -- `repost_of` set, so it inherits feed, moderation and RLS for free.
),
expected_columns(tbl, col) as (values
  ('posts','reply_count'), ('posts','repost_count'), ('posts','edited_at'),
  ('posts','repost_of'),
  ('profiles','deleted_at'), ('profiles','tos_accepted_at'),
  ('profiles','tos_version'), ('profiles','onboarded_at'),
  ('profiles','dob_confirmed'), ('profiles','role'),
  ('reports','status'), ('reports','resolved_by')
),
expected_functions(name) as (values
  ('is_staff'), ('is_blocked'), ('toggle_like'), ('toggle_repost'),
  ('create_group'), ('request_account_deletion'), ('accept_terms'),
  ('complete_onboarding'), ('mark_notifications_read'), ('resolve_report'),
  ('open_report_count'), ('feed_page'), ('suggested_profiles'),
  ('handle_new_user'), ('enforce_rate_limit'), ('faero_unique_username'),
  ('push_notification'), ('purge_deleted_accounts')
),
expected_triggers(name) as (values
  ('trg_sync_like_count'), ('trg_sync_reply_count'), ('trg_notify_like'),
  ('trg_notify_follow'), ('trg_notify_reply'), ('trg_throttle_posts'),
  ('trg_throttle_replies'), ('trg_throttle_messages'), ('on_auth_user_created')
)

select distinct * from (
  -- ── tables ────────────────────────────────────────────────────────
  select
    1 as sort, 'TABLE' as kind, e.name as object,
    case when c.relname is null then '❌ MISSING' else '✅ PASS' end as status
  from expected_tables e
  left join pg_class c on c.relname = e.name
    and c.relnamespace = 'public'::regnamespace and c.relkind = 'r'

  union all
  -- ── columns ───────────────────────────────────────────────────────
  select
    2, 'COLUMN', e.tbl || '.' || e.col,
    case when a.attname is null then '❌ MISSING' else '✅ PASS' end
  from expected_columns e
  left join pg_attribute a
    on a.attrelid = to_regclass('public.' || e.tbl)
   and a.attname = e.col and a.attnum > 0 and not a.attisdropped

  union all
  -- ── functions ─────────────────────────────────────────────────────
  select
    3, 'FUNCTION', e.name,
    case when p.proname is null then '❌ MISSING' else '✅ PASS' end
  from expected_functions e
  left join pg_proc p on p.proname = e.name
    and p.pronamespace = 'public'::regnamespace

  union all
  -- ── triggers ──────────────────────────────────────────────────────
  select
    4, 'TRIGGER', e.name,
    case when t.tgname is null then '❌ MISSING' else '✅ PASS' end
  from expected_triggers e
  left join pg_trigger t on t.tgname = e.name and not t.tgisinternal

  union all
  -- ── RLS enabled on every public table ─────────────────────────────
  select
    5, 'RLS', c.relname,
    case when c.relrowsecurity then '✅ PASS'
         else '⚠️  RLS OFF — world writable' end
  from pg_class c
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'

  union all
  -- ── tables with RLS on but no policies (locked out) ───────────────
  select
    6, 'POLICIES', c.relname,
    case when count(p.polname) = 0 and c.relrowsecurity
         then '⚠️  0 policies — nobody can read this'
         else '✅ ' || count(p.polname) || ' policies' end
  from pg_class c
  left join pg_policy p on p.polrelid = c.oid
  where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
  group by c.relname, c.relrowsecurity
) q
order by sort, status desc, object;
