# What to actually upload

This folder is a workspace. It holds ~30 HTML files, but **only a handful are
the live app**. If you upload the whole folder, you publish all of it — old
prototypes, experiments, and an internal ops console — on the same domain,
sharing the same login session as the real app.

That matters more than it sounds. A visitor doesn't need a link: they can just
type the filename.

---

## ✅ Upload these

```
faero_v1_launch.html        the app itself
faero_profile_native.css    styles it depends on
faero_profile_native.js     scripts it depends on  ← easy to forget, hard 404
sw.js                       offline support
manifest.webmanifest        install-to-homescreen
icons/                      the whole folder
og-card.jpg                 link preview image
TERMS_OF_SERVICE.md
PRIVACY_POLICY.md

index.html                  the faero OS desktop — this is the site root
apps/                       OS apps (each opens in an iframe window)

  NOTE: css/ and js/ are ORPHANED. index.html inlines its own CSS and its own
  copy of the OS engine, and loads nothing from either directory — verified by
  grepping index.html for src="js/ and href="css/, which return no matches.
  js/os.js still holds a stale second copy of the app registry that has already
  drifted from the live one (it lists settings, ps1 and tv, which the live
  registry does not). Editing it looks like it should work and does nothing.
  Worth deleting or re-wiring, but that is a refactor, not a deploy step.

vercel.json                 headers                 (Vercel only)
_headers                    headers                 (Netlify / Cloudflare)
```

Both `faero_profile_native.css` **and** `.js` are loaded by `<script>`/`<link>`
tags in the page. The `.js` was missing from this list for a while; following
the list literally shipped a 404 and a half-dead app.

The host config files are not optional. Without them you lose the entire
security-header set.

### How the two shells relate

This repo serves **two** top-level pages, and the distinction matters:

| URL | Page |
|---|---|
| `/` | The faero OS desktop (`index.html`) |
| `/faero_v1_launch.html` | The social app, standalone |

The social app is *both* a window inside the OS (the `faero` icon opens it in
an iframe) and its own page. That is deliberate — its Supabase auth redirect
URLs, PWA `start_url` and legal links are all registered against
`/faero_v1_launch.html`.

⚠️ **There is no root rewrite here, and there must not be one.** The
standalone-app repo rewrote `/` to `faero_v1_launch.html` because it had no
`index.html`. Here `/` is the OS's own page; that rewrite would replace the
desktop with the social app. The `_redirects` file carrying it was removed
during the integration.

⚠️ **Do not move the app under `apps/`.** It looks tidier next to the other OS
apps, but relocating it changes its URL, and Supabase matches auth redirect
URLs exactly — password reset and email confirmation would break. The OS app
registry points at the root path on purpose.

⚠️ **Frame headers must stay `SAMEORIGIN` / `frame-ancestors 'self'`.** The
standalone repo used `DENY` / `'none'`. Those block *same-origin* framing too,
so adopting them would stop the OS from opening the app at all — while looking
like a straightforward security improvement.

⚠️ **Do not turn `cleanUrls` back on in `vercel.json`.** The comment at the top
of that file explains what it broke; the short version is that stripping `.html`
silently breaks password reset.

Optionally `check.html` — the database checker. It only uses the public anon
key and can't change anything, but it does reveal your schema, so leave it out
if you'd rather not advertise that.

## ❌ Do not upload these

| File | Why |
|---|---|
| `faero_ops.html` | Internal ops console. It asks for your **service_role key** — the key that bypasses every security rule. A page that prompts for it should never be on a public domain, both because it's a target and because it teaches people to paste that key into a web form. Run it from your own machine only. |
| `faero_v1_launch.backup-*.html` | **Already moved** to `F:\faero-backups-DO-NOT-DEPLOY\`. These are pre-fix copies containing 18–20 cross-site-scripting holes that were fixed in the live file. Publishing them undoes the fix: an attacker just loads the backup filename and gets the vulnerable app, on your domain, with your users' sessions. |
| `_rasterize.html`, `_glasstest/` | Build tools. |
| `aeronet_v9_*`, `faero_koi_*`, `faero_myspace_*`, `faero_nav_os_lab`, `faero_profile_*`, `faero_snaps*`, `faero_v2_*`, `groups_option_*`, `groups_v1_*`, `msn_chat_*`, `frutiger_*`, `faero_chat_b_*` | Old prototypes and design experiments. Not maintained, not security-reviewed, and some talk to the same database. |
| `sql/`, `supabase/` | Server-side code and migrations. Nothing here belongs on a web server. |
| `beta/` | An earlier fork of the social app (~80 KB) pointing at a **different Supabase project** (`pvqxsgqqlupldroooyhy`) that never received the RLS migrations. Publishing it exposes that database through a public anon key. Kept only because recent avatar/badge work landed here and has not been ported to the shipping app. |
| `patch*.py` | One-off local patch scripts. |
| `_glasstest/`, `faero_liquid_metal_v4.html`, `faero_koi_30_v3.html` | Design experiments. |

---

## Remaining hardening (known gap, not an oversight)

`vercel.json` and `_headers` enforce **only** `frame-ancestors 'self'` for CSP.
The rest of a real policy — `script-src`, `connect-src`, `frame-src` — is not
shipped, and that is a deliberate, recorded decision rather than something
forgotten.

The reason is this origin's mixed contents. Alongside the social app it serves
roughly twenty legacy OS apps that load from `cdn.emulatorjs.org`,
`unpkg.com`, `cdn.jsdelivr.net`, `stream.zeno.fm`, `00s.myretrotvs.com`,
`api.dicebear.com`, YouTube, Twitch, Mixcloud and SoundCloud. A policy written
without exercising each of those breaks them silently — and a CSP that gets
rolled back after launch is worse than one introduced deliberately.

`frame-ancestors` is safe to enforce alone because it governs who may frame
this site, not what the site may load.

To finish the job: add `Content-Security-Policy-Report-Only` with a full
policy, open every app in the OS, collect the violation reports, then promote
it to enforcing. Do it *before* the user base grows, not after.

Note that `Permissions-Policy` deliberately does **not** restrict `camera` or
`microphone`: the Disposable and Calendar apps call `getUserMedia`, and the OS
grants them through the iframe `allow=` attribute. Locking those down here
kills both apps.

---

## The rule of thumb

**Anything you wouldn't hand to a stranger shouldn't be in the folder you
upload.** Old versions of a page are not harmless just because nothing links to
them — fixing a security bug only counts if the broken copy stops being served.

The cleanest habit: keep a separate `dist/` folder containing only the ✅ list,
and upload that. Then it's impossible to leak a workspace file by accident.
