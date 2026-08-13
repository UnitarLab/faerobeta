# Faero — running the database migration

## The short version

**Run `00_reconcile_legacy_tables.sql`, then `00b_fix_updated_at_triggers.sql`,
then `RUN_ME_ALL_IN_ONE.sql`, then `07_error_log.sql`, then step 4 below.**

The two `00*` files exist because this database is not clean, in two separate
ways:

- **00** — `replies`, `reports` and `groups` predate the migration, and
  `create table if not exists` skips them rather than reshaping them, so the
  migration then references columns that were never added.
- **00b** — a pre-existing `set_updated_at()` trigger is attached to tables
  with no `updated_at` column, so every `UPDATE` on them has always failed.
  This is not something the migration introduced; it is something the
  migration *revealed*.

Run both first or the migration aborts on a missing column. Both are
idempotent, and both do nothing on a clean database.

`RUN_ME_ALL_IN_ONE.sql` is files 01 + 03 + 06 + 05 concatenated in the correct
order with a wrong-project guard on the front. If you only do one thing, do
that — it is the whole of steps 1, 3, 3.5 below in a single paste.

**Do not run only `01_beta_launch_migration.sql`.** It leaves row-level
security off on the pre-existing tables. Step 3.5 explains what that costs you.

The numbered files below are the same SQL split up, kept for when you need to
run or re-read one piece in isolation. Files 00 and 02 only read; 01, 03, 06
and 07 change things.

---

Run these **in order**, in the Supabase SQL Editor.

---

## ⚠️ FIRST: are you in the right project?

If you have more than one Supabase project, the SQL Editor can very easily be
open on the wrong one. When that happens the migration appears to run — or
fails with **`relation "public.profiles" does not exist`** — and the app never
changes, because you edited a different database.

**This is the #1 way this goes wrong. Check before you paste anything.**

Open this exact link — it can only open the correct project:

> **https://supabase.com/dashboard/project/fifnkgpxtnmjycxkkqhz/sql/new**

Then paste this and Run. It must print `RIGHT PROJECT ✅`:

```sql
select case
  when current_setting('request.jwt.claims', true) is not null
    or to_regclass('public.posts') is not null
  then 'RIGHT PROJECT ✅ — posts table found, carry on'
  else 'WRONG PROJECT ❌ — no posts table here, do not run the migration'
end as check;
```

If it says **WRONG PROJECT**, stop. Look at the address bar: the code after
`/project/` must be `fifnkgpxtnmjycxkkqhz`. That string also appears in
`faero_v1_launch.html` — the app and the SQL Editor must match.

---

## Where exactly

1. Go to **https://supabase.com/dashboard**
2. Pick your Faero project (ref `fifnkgpxtnmjycxkkqhz` — check it matches the
   URL in `faero_v1_launch.html`)
3. Left sidebar → **SQL Editor** (the `>_` icon)
4. Click **+ New query** (top left of the editor)
5. Open the `.sql` file in a text editor, select all, copy, paste into the
   editor, and press **Run** (or Ctrl/Cmd + Enter)

One file per query tab. Don't paste all three at once.

---

## Step 0 — pre-flight (read-only, ~1 second)

Paste **`00_preflight_check.sql`** and Run.

You'll get a table of `table_name / column_name / status`. **Every row must
say `OK`.** Problems are sorted to the top.

- `MISSING TABLE` — that table doesn't exist in your project yet.
- `MISSING COLUMN` — the table exists but the column is named something
  else in your schema.

If anything is missing, tell me what it says and I'll adjust the migration
to match your actual schema. Don't run step 1 until this is all green —
the migration references those tables and will abort if they're absent.

## Step 1 — the migration (~5 seconds)

Paste the **whole** of **`01_beta_launch_migration.sql`** — all 1006 lines,
starting at the `--` comment header and ending after the final commented-out
audit query — and Run.

**It is one transaction** (`begin;` … `commit;`). If anything fails, the
entire thing rolls back and your database is left exactly as it was. There
is no half-applied state to clean up.

**It is idempotent.** Safe to run twice. Every object uses
`create or replace`, `if not exists`, or `drop … if exists` first.

Expect: **Success. No rows returned.** That's the correct result — the file
ends with DDL and grants, not a select.

If you see an error, copy the whole message to me. The likely ones:

| Error | Means |
|---|---|
| `relation "public.guestbook" does not exist` | You don't have that table; step 0 would have caught it |
| `column "author_id" does not exist` | Your guestbook uses different column names |
| `permission denied for schema auth` | Run it as the dashboard owner, not a restricted role |

## Step 2 — verify (read-only)

Paste **`02_verify_after.sql`** and Run. It's a single query and changes
nothing — one row per object, with a verdict.

| Row says | Meaning |
|---|---|
| `✅ PASS` | Present and correct |
| `❌ MISSING` | The migration didn't fully apply — see Step 3 |
| `⚠️ RLS OFF — world writable` | **Launch blocker.** Anyone can write that table |
| `⚠️ 0 policies — nobody can read this` | RLS is on but nothing is permitted |

Problems sort to the top, so if the first row is `✅ PASS` you're clean.

It checks the 7 new tables, 11 new columns, 18 functions the client calls,
9 triggers, and the RLS state of **every** public table.

---

## Step 3 — if the app still says "pre-migration compatibility mode"

This is the common one, and it usually is **not** a failed migration.

Supabase's API layer keeps an in-memory snapshot of your schema. After a big
migration that snapshot can lag, so the database has the new columns but the
API still reports:

- `column posts.reply_count does not exist` (code `42703`)
- `Could not find the function public.open_report_count in the schema cache`
  (code `PGRST202`)

Paste **`05_reload_schema_cache.sql`** and Run. It sends the reload signal and
then proves, straight from the system catalogue, whether each object really
exists.

- All rows `✅ in database` → it was just the cache. Hard-refresh the app
  (**Ctrl+Shift+R**) and you're done.
- Any row `❌ genuinely missing` → the migration really didn't apply. Re-run
  `01_beta_launch_migration.sql`; it's idempotent.

Still stuck? **Dashboard → Settings → General → Restart project** forces a cold
rebuild of the cache (~20 seconds of downtime).

---

## Step 3.5 — LOCK DOWN THE OLD TABLES ⚠️ launch blocker

Run **`06_base_table_rls.sql`**.

File 01 turns on row-level security for the tables it creates, but it never
touches the ones that already existed — `posts`, `profiles`, `likes`,
`follows`, `messages`, `guestbook`, `group_members`, `bans`, `conversations`.

If those have RLS off, your public anon key lets anyone delete or deface any
post, read every DM, forge likes and follows, and set `role = 'admin'` on
themselves. In a penetration test against a database in that state, a second
user deleted another user's post on the first attempt.

`06` creates the policies **and then** enables RLS, in one transaction, so
there's never a window where the app is broken. It also adds a trigger that
stops a user editing their own `role` or `is_og` — without it, the
"you may edit your own profile" policy is a self-promotion hole.

Verified against a real PostgreSQL 16 instance: 13 attacks refused, and a
12-step happy path (post, edit, reply, follow, like, guestbook, bookmark,
block, read feed, read profiles, edit profile, delete own post) still works.

If something legitimate stops working afterwards, tell me which action failed
— don't switch RLS back off.

---

## Step 4 — make yourself an admin

There is **no admin account and no admin password** in Faero. "Admin" is a flag
on your own normal account, so nobody can hand you credentials — you make your
own.

1. **Sign up in the app** with your email and a password you choose.
2. Open **`04_make_me_admin.sql`**, change the email on the `\set` line to
   yours, paste the file, and Run.
3. Sign out and back in. **👑 Mod Panel** appears in your user menu, with the
   Reports tab.

The script prints your row back so you can confirm it worked, and warns you if
your email isn't confirmed yet.

---

## What file 01 actually does

| Section | Fixes |
|---|---|
| 0 | `is_staff()`, `enforce_rate_limit()` helpers |
| 1 | Profiles created server-side by trigger + backfills existing ghost accounts |
| 2 | `blocks` table, mutual-block check, follow teardown |
| 3 | `replies` table, `reply_count`, RLS, 20-per-5-min throttle |
| 4 | `like_count` owned by triggers, `toggle_like()`, counts made immutable from the client, drift reconciled; post/message throttles |
| 5 | `notifications` + triggers for like / follow / reply / @mention |
| 6 | `reports` status workflow, `resolve_report()`, staff-only read policy |
| 7 | `groups` insert policy + `create_group()` |
| 8 | `bookmarks` |
| 9 | `request_account_deletion()`, `purge_deleted_accounts()`, terms/age columns |
| 10 | `feed_page()` and `suggested_profiles()`, both block-aware |
| 11 | Guestbook throttle + block guard |
| 12 | Reposts: `repost_of`, `repost_count`, `toggle_repost()` |
| 13 | `push_subscriptions` |
| 14 | Grants to `authenticated` / `anon` |

Nothing in this file drops a table or deletes user content. The only
destructive statements are `drop trigger if exists` immediately followed by
recreating that same trigger.
