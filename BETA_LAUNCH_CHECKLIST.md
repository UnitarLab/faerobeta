# Faero Beta — Launch Checklist

Everything in the launch-blocker review is now implemented in code. What
remains is **operational**: the client changes assume a migrated database and
a locked-down upload preset. Do these in order.

---

## 1. Run the database migration ⚠️ REQUIRED

Supabase → SQL Editor → paste and run, in this order:

```
sql/00_reconcile_legacy_tables.sql
sql/00b_fix_updated_at_triggers.sql
sql/RUN_ME_ALL_IN_ONE.sql
```

⚠️ **File 00 is not optional on this database.** `replies`, `reports` and
`groups` already existed here from an earlier schema, and the main migration
creates them with `create table if not exists` — so Postgres skips them and
then references columns that only exist in the newer definition. Without file
00 the migration aborts with `42703: column "parent_id" does not exist`, and
after that one is patched, twice more on `reports.entity_id`. File 00 adds the
six missing columns first. It is idempotent; on a clean database it does
nothing.

⚠️ **File 00b is also not optional here.** This database has a pre-existing
`set_updated_at()` trigger function — it appears nowhere in the Faero
migration — attached to tables that have no `updated_at` column. Only
`profiles` and `groups` had one. That means **every `UPDATE` on those tables
has been failing since the trigger was created**, long before this migration;
the migration is just the first thing to attempt one, and it aborts with
`42703: record "new" has no field "updated_at"`. File 00b finds the affected
tables by querying `pg_trigger` and adds the column, so the trigger does what
it was written to do. Read its first query's output — it tells you which
tables were silently un-updatable.

⚠️ **This used to say `sql/01_beta_launch_migration.sql`, and that was not
enough to launch on.** File 01 enables row-level security on the tables it
*creates*, but never touches the ones that already existed — `posts`,
`profiles`, `likes`, `follows`, `messages`, `guestbook`, `group_members`,
`bans`, `conversations`. Those are locked down by file **06**, and if you
skip it your public anon key lets anyone read every DM, deface any post, and
set `role = 'admin'` on themselves. See `sql/README.md` step 3.5.

`RUN_ME_ALL_IN_ONE.sql` is files 01 + 03 + 06 + 05 concatenated in the correct
order, with a guard at the top that aborts loudly if you're in the wrong
Supabase project. It is idempotent — safe to run twice, and safe to run if you
already ran 01 by itself.

Then run `sql/07_error_log.sql` (backing table for step 6's error collector).

Afterwards open `check.html` and press "Run the check" — it should report all
checks passed. Then do step 4 of `sql/README.md` to make yourself an admin.

Between them these create:

| Object | Fixes |
|---|---|
| `handle_new_user()` trigger + ghost-account backfill | #2 ghost accounts |
| `replies` table, `reply_count`, RLS, throttle | #3 replies |
| `sync_like_count()` trigger + `toggle_like()` RPC + `guard_post_counts()` | #4 racy likes |
| `request_account_deletion()`, `purge_deleted_accounts()` | #7 deletion |
| `blocks` table + `is_blocked()` + follow teardown | #8 block/mute |
| `reports.status` workflow + `resolve_report()` + staff read policy | #9 report queue |
| `groups` insert policy + `create_group()` RPC | #10 commons creation |
| `notifications` + like/follow/reply/mention triggers | P1 dead bell |
| `enforce_rate_limit()` on posts, replies, messages, groups | P1 spam |
| `bookmarks`, `edited_at`, `feed_page()`, `suggested_profiles()` | P1 primitives |

**Until you run it**, the app detects the old schema and drops into
compatibility mode: the feed still works, and reply/bookmark controls stay
hidden rather than erroring. You'll see a console warning. Verified working.

Afterwards, run `sql/02_verify_after.sql`. Every public table should report
`rls_enabled = true` with at least one policy. Problems sort to the top, so if
the first row is `✅ PASS` you're clean.

If the app still reports pre-migration compatibility mode after all that, it is
usually Supabase's schema cache lagging rather than a failed migration — run
`sql/05_reload_schema_cache.sql`, which tells you which of the two it is.

## 2. Deploy the deletion Edge Function

```bash
supabase functions deploy delete-account
```

Without it, account deletion still erases all content and anonymises the
profile — the app says so honestly rather than claiming a clean delete — but
the `auth.users` row survives until `purge_deleted_accounts()` runs.

## 3. Lock down the Cloudinary preset ⚠️ REQUIRED

The unsigned preset is readable in page source; client checks alone are not a
security boundary. Cloudinary → Settings → Upload → `faero_unsigned`:

- Allowed formats: `jpg, png, webp, gif, avif`
- Max file size: **8 MB**
- Incoming transformation: `c_limit,w_2000,h_2000,q_auto`
- Unique filename: **on**, folder: fixed

The client now posts to `/image/upload` (never `/auto/upload`), validates size,
MIME type **and magic bytes**, and rejects any response URL that isn't
`res.cloudinary.com`.

## 4. Auth configuration

Supabase → Authentication:

- **URL Configuration → Redirect URLs**: add your production URL *and*
  `.../faero_v1_launch.html`. Password reset and email confirmation both
  bounce without this.
- **Providers → Email**: decide on "Confirm email". Both states are handled —
  confirmation on shows a verify pane with resend; off completes signup
  inline — but pick one and test it.

## 5. Web push (optional but wired)

Push is fully built and off by default — the switch is in
Settings → Notifications, and the app never prompts unasked.

```bash
npx web-push generate-vapid-keys
```

1. Paste the **public** key into `FAERO_VAPID_PUBLIC_KEY` in the HTML.
   Until you do, the toggle shows "Not configured on this deployment yet".
2. `supabase functions deploy send-push --no-verify-jwt`
3. `supabase secrets set VAPID_PUBLIC_KEY=… VAPID_PRIVATE_KEY=… VAPID_SUBJECT=mailto:you@… PUSH_WEBHOOK_SECRET=<long random string>`
4. Database → Webhooks → new webhook on `public.notifications` (INSERT),
   URL `https://<ref>.functions.supabase.co/send-push`, header
   `x-webhook-secret: <the same string>`.

`--no-verify-jwt` is required because the webhook carries no user JWT — the
shared secret is what authenticates it, so don't skip step 3. Likes are
deliberately excluded from push; only replies, mentions, follows and reposts
reach a device.

## 6. Before you announce

- [ ] `og-card.jpg` (1200×630, 62 KB) is generated and committed. Update
      `og:url` / `og:image` / `twitter:image` to your real domain.
      To regenerate after a brand change: start `_devserver.py` and open
      `_rasterize.html`, which redraws it on a canvas with the real Exo 2
      and POSTs it back to disk.
- [ ] **Do not deploy the `_`-prefixed files.** `_devserver.py` exposes a
      file-write endpoint and `_rasterize.html` is a build tool; both are
      local-only.
- [ ] Deploy the error collector, or you're flying blind on launch day:
      `supabase functions deploy log-error --no-verify-jwt` (after running
      `sql/07_error_log.sql`). `FAERO_ERROR_ENDPOINT` is already wired to it.
      Until it's deployed the beacons 404 silently — harmless, since
      `sendBeacon` ignores the response — and errors still buffer locally for
      `faeroDebugDump()`. `--no-verify-jwt` is required: `sendBeacon` can't set
      an Authorization header, and the reports that matter most come from users
      who never got as far as signing in.
- [ ] Update `FAERO_DELETE_FN_URL` if your Supabase project ref differs.
- [ ] Read `TERMS_OF_SERVICE.md` and `PRIVACY_POLICY.md` and make sure they
      describe what you actually do. **Have a lawyer look at them** — they are
      a solid starting draft, not legal advice.
- [ ] Bump `CACHE_VERSION` in `sw.js` on every deploy or users get stale code.
      Currently `faero-v1.0.0-beta.2` — bump it *in* the deploy commit, not after.
- [ ] Ship the host config: `vercel.json` (Vercel) or `_headers` + `_redirects`
      (Netlify / Cloudflare). Without them you lose every security header and
      the `/` rewrite, and the bare domain 404s. See `DEPLOY.md`.
- [ ] Don't re-enable `cleanUrls` in `vercel.json`. Stripping `.html` breaks
      the shell's Cache-Control rule, the service worker's offline fallback,
      the PWA `start_url`, and — because Supabase matches redirect URLs exactly
      — password reset and email confirmation.
- [ ] The Supabase JS SDK is pinned to `2.112.3` with an SRI hash. To upgrade,
      change the `src` and the `integrity` attribute **together**; a mismatch
      means the SDK refuses to load. Recompute with
      `openssl dgst -sha384 -binary supabase.js | openssl base64 -A`.
- [ ] Make yourself an admin: `update profiles set role='admin' where username='you';`

---

## What changed in the app

### P0 — was blocking

1. **Lockout** — "Forgot your password?" on the sign-in pane, a reset pane, a
   set-new-password pane triggered by `#type=recovery`, and a
   `PASSWORD_RECOVERY` listener. Reset responses never reveal whether an email
   is registered.
2. **Ghost accounts** — profile creation moved server-side to a trigger.
   `faeroEnsureProfile()` reads before writing, retries username collisions,
   and runs on every sign-in. Email-unconfirmed state has its own pane with
   resend. Existing ghosts are backfilled by the migration.
3. **Replies** — real table with threads, inline composer, ⌘/Ctrl+Enter to
   send, delete for author and staff, DB-maintained counts, @mention
   notifications, 20-per-5-min throttle.
4. **Like counts** — `toggle_like()` RPC in one round trip; counts owned by a
   trigger; a guard trigger makes `like_count`/`reply_count` immutable from the
   client. Optimistic UI that rolls back on failure. Drift reconciled by the
   migration.
5. **XSS** — one `faeroEsc()` escaping all five characters, plus
   `faeroSafeUrl()` which strips control characters and rejects anything that
   isn't http(s). **All inline `onclick` handlers carrying user data are gone**,
   replaced by `data-act` attributes and one delegated listener. Verified: a
   post crafted with `'`, `"`, `<script>` and `javascript:` URLs yields zero
   script nodes, zero inline handlers, and no image src.
6. **Uploads** — type + size + magic-byte validation, `/image/upload`,
   response-URL check. Plus the preset hardening in step 3.
7. **Deletion & legal** — real two-stage erasure, JSON data export, ToS and
   Privacy links in signup and Settings, an age gate, and a re-consent gate
   when `FAERO_TOS_VERSION` changes.
8. **Block & mute** — per-user, mute one-way and silent, block mutual and
   tearing down follows via trigger. Managed in Settings → Safety, applied to
   feed, threads and notifications.
9. **Report queue** — a Reports tab with status filters, the reported content
   inline, and start-review / delete / ban / action / dismiss, plus an unread
   badge.
10. **Commons creation** — full modal with name, description, tag picker,
    validated cover upload, slug generation, owner membership, 3/day limit.

### Second pass — the gaps found on audit

- **Deep links.** Mentions rendered `#profile/handle` and Share copied
  `#post/id`, but the router only accepted `#/slug`, so every shared link
  landed on the feed. There's now a real entity router: `#profile/<handle
  or uuid>` resolves the handle and opens the profile, `#post/<uuid>` opens
  the single post with its thread expanded and a "back to the feed" link,
  and `#tag/<tag>` opens the tag view. popstate and hashchange are
  de-duplicated so one back-press routes once.
- **Guestbook rate limit** — 10 per 10 minutes, plus a trigger stopping
  someone you've blocked from writing on your wall.
- **Repost & quote.** A repost is a post with `repost_of` set, so it
  inherits the feed, notifications, moderation and deletion paths already
  built. Plain reposts are one-per-person (enforced by a partial unique
  index) and toggleable; quotes carry commentary above the embedded
  original. Reposting a repost boosts the original rather than nesting.
- **Focus traps** on Settings, Edit profile and the Ban modal — the three
  that were left untrapped.
- **Web push** — subscription table with RLS, service-worker `push` and
  `notificationclick` handlers that focus an existing tab, a sender Edge
  Function that prunes dead subscriptions on 404/410, and an opt-in switch
  that reports its true state (browser-blocked, unsupported, unconfigured).
- **Font payload** — was 14 families in one request. Now 3 load eagerly
  (Exo 2, Lora, Space Mono); the other 9 are picker options fetched only
  when Settings → Themes is opened. Verified: 2 font requests at boot, 11
  after opening the picker. The chosen font also now survives a reload,
  which it previously didn't.
- **Mobile reflow** — a real pass, not just the bottom nav: a 1020px step
  that narrows the left rail before dropping it, the expanded profile and
  commons variants collapsed too, the duplicated rail nav hidden below
  860px, topbar shedding nav and search, modals becoming bottom sheets,
  and a 480px step for the logo, tag grid and stat grids.

### P1 & P2

Cursor pagination with auto-load; realtime that fetches one row and prepends
it behind an "N new posts" pill instead of refetching everything; rate limits;
notification triggers; a three-step onboarding wizard with tag picks and
suggested follows; clickable hashtags and @mentions; repost/share; bookmarks
with a Saved sheet; post editing; follower/following lists; image lightbox;
skeletons and honest empty/error states; OG and Twitter cards; inline SVG
favicon; PWA manifest, icons and a service worker with a network-first shell;
mobile bottom nav with 48px targets and a search sheet; focus traps, Escape
handling, `role="dialog"`, a skip link, focus-visible rings and
reduced-motion support; non-blocking font loading; an error ring buffer with
breadcrumbs; and an offline banner.

---

*Backup of the pre-beta file: `faero_v1_launch.backup-prebeta.html`*
