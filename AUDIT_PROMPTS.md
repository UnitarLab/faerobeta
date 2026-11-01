# Faero — feature audit prompts

One prompt per feature. Paste one into a fresh Claude Code session in this
folder; each is written to stand alone. Run them one at a time, or several in
parallel since they touch different areas, but fix in one place at a time.

Every prompt starts from the same ground rules, so paste this block first,
then the feature prompt under it.

---

## Ground rules (paste above any prompt)

```
You are auditing one feature of Faero, a social site for music (artists and
fans). The live app is ONE file, faero_v1_launch.html (~15k lines, inline CSS
and JS), plus faero_space.js / faero_space.css (Radio, Booth, profile spaces,
player) and faero_profile_native.js / .css. Backend is Supabase project
fifnkgpxtnmjycxkkqhz; schema and RLS are in sql/ (01, 03, 06, 08, 09, 10, 11
are the important ones). Edge Functions are in supabase/functions/.
Hosting: Vercel, deploys the whole repo minus .vercelignore.

Your job is to FIND GAPS, not to rewrite. For this feature:
1. Read the code paths end to end (UI → JS → Supabase call → RLS/trigger).
2. Try it in the browser preview (launch config "faero-os", port 8910):
   signed out, and as far as you can signed in. Phone width (375px) and
   desktop. Do not create accounts or post on the live database without
   asking me first.
3. Look specifically for: things that silently fail, empty or stuck states,
   errors swallowed without telling the user, missing permission checks
   (anything the UI hides but the API still allows), XSS (every place user
   text reaches innerHTML), race conditions (double clicks, slow network,
   switching pages mid-load), mobile layout breaks, keyboard/screen-reader
   problems, and anything the Privacy Policy or Terms promise that the code
   doesn't do.
4. Report a ranked list: severity (blocker / bad / minor), what happens, how
   to reproduce, file:line, and the fix you'd make. Don't fix anything yet
   unless I say so.
```

---

## 1. Sign-up, sign-in, password reset, Terms gate, onboarding

```
Audit accounts: faeroOpenAuth, faeroDoSignUp, faeroDoSignIn, faeroDoReset,
faeroDoNewPassword, faeroHandleAuthRedirect, faeroResendVerify,
faeroEnsureProfile, faeroAcceptTerms / faeroOpenTermsGate (FAERO_TOS_VERSION is
'2026-10-31', bumped so everyone re-accepts), the onboarding flow
(onboarded_at), faeroCheckBan, and the age confirmation.

Check: redirect URLs all point at /faero_v1_launch.html (Supabase matches
exactly); what happens on faero.net vs www.faero.net (apex DNS is still
broken); password rules and error messages; rate-limit handling; a user who
signs up but never confirms email; a user who closes the Terms gate without
accepting (can they still post?); accept_terms() trusts any p_version string —
is that a problem; the under-13 rule in the Terms vs what sign-up enforces;
signing out in one tab while another tab is open; the handle_new_user trigger
and username collisions.
```

## 2. Feed and posting

```
Audit the feed and composer: faeroLoadFeed, faeroRenderPost, faeroWireCompose,
composePickPhoto (also used by Booth's "Post to Faero"), music links in posts
(detectMusicPlatform, resolveAudioEmbed, initMusicEmbeds — Bandcamp needs a
numeric id we don't have), place tags, filters (All / Images / Text), list vs
grid layout, Everything vs Following, load more, realtime new-posts pill
(faeroStartFeedRealtime), faeroLinkifyBody.

Check: post length limits (DB caps posts at 5000), image validation and the
Cloudinary unsigned upload preset (can anyone upload anything to it?), what a
failed upload leaves behind, double-submit, posting while offline, very long
words/URLs breaking layout, linkify XSS, realtime duplicates or posts from
blocked people appearing, post_privacy = 'followers' actually being enforced
in the API (not just hidden in the UI), and the feed for a brand-new user
with nobody followed.
```

## 3. Post actions: likes, reposts, quotes, replies, bookmarks, share, links

```
Audit faeroToggleLike, faeroToggleRepost / faeroUndoRepost, faeroOpenQuoteComposer
/ faeroSubmitQuote, faeroToggleThread / faeroLoadThread / faeroSendReply /
faeroDeleteReply, faeroToggleBookmark, faeroSharePost, and deep links
(#post/<id>, #profile/<name>, #tag/<tag>) via faeroParseHash / faeroRouteFromHash.

Check: counts drifting from reality (optimistic UI vs failures), liking twice
fast, replying to a deleted post, deleting a post that has replies/quotes,
reposting a followers-only post, notification spam from like/unlike loops,
RLS on likes/replies/bookmarks (can I delete someone else's reply via the
API?), reply length (2000 cap), and every deep link from a signed-out visitor.
```

## 4. Explore, search and tags

```
Audit exBoot, exLoadPeople, exLoadTrendingTags, exLoadTrendingPosts, exSearch /
exDoSearch, exHighlight, exTagFilter, faeroOpenTag, the mobile search sheet,
and trending_tags RPC.

Check: search injection into PostgREST filters (ilike with %, commas, parens),
exHighlight XSS, results including deleted or banned users, blocked users
showing up, empty states, slow queries without limits, and whether search
works signed out.
```

## 5. Classic profile and Edit profile

```
Audit pfBoot, pfRenderHeader / About / Stats / Posts / Pinned / Friends /
Commons, pfToggleFollow, faeroOpenFollowList, increment_profile_views, and the
Edit profile modal (epBuildModal, epSave, epSanitiseUsername, avatar / banner /
background uploads, tags).

Check: validate_profile_fields trigger vs the UI's own rules (do they agree?),
username change breaking old #profile/<name> links, view counting abuse (can I
inflate someone's views?), follow/unfollow counts, viewing a deleted user,
viewing a banned user, website links (rel / target), pronouns and links
columns (where are they edited?), and what the classic profile still shows
now that profile spaces cover the columns below the header.
```

## 6. Profile spaces (blocks)

```
Audit faero_space.js: renderProfile, normSpace / cleanData (sanitising),
the 16 block types and their LOADERS, the editor (style / size / move / fill /
add / drag), persist / saveSpace, pinToSpace (Radio "Put on my space"),
the visitor Report button, FaeroSpace.adminClearSpace, and sql/09 (size and
shape trigger on profiles.space).

Check: a layout saved in one browser and viewed in another; the local-only
fallback when saving fails; editing on a phone (drag doesn't work on touch —
are the ◀ ▶ buttons enough?); uploads in the New release block; every block
when its data is empty, huge, or hostile (I already fed it script tags and
javascript: links — go further: unicode tricks, giant strings near the 24 KB
cap, 40 blocks); embeds from posts that were deleted; what visitors see while
it loads; and whether the classic profile header plus the space reads as one
page.
```

## 7. Profile styles (themed pages)

```
Audit the profile style system: fsGetProfileTheme / fsSetProfileTheme,
pfApplyProfileTheme, _pfFrameSrc (now apps/faero-profiles.html), _pfLoadPayload,
the faeroProfileReady / faeroSetTheme postMessage handshake, and
apps/faero-profiles.html itself.

Check: the chosen style is stored only in localStorage, so visitors never see
it — is that intended now that spaces exist, or should styles and spaces
merge? postMessage uses '*' as the target origin — tighten it. Does the themed
page escape everything it receives? How does it look with the space hidden?
```

## 8. Guestbook

```
Audit the guestbook in both places: the classic profile (pfRenderGuestbook,
pfGuestPost) and the Guestbook block in profile spaces (LOADERS.guestbook,
onGuestbook in faero_space.js).

Check: signing your own guestbook, signing as a blocked user, the 500-char
cap, rate limiting / spam, deleting a note (can the profile owner remove notes
left on their page? can the author?), reporting a note, notifications, and
RLS on the guestbook table.
```

## 9. Groups (commons) and events

```
Audit gc*: gcLoadGroups, gcJoin, gcOpenDetail, gcDetailPost, gcVote,
gcDetailLoadMembers, gcSubmitCreate / gcPickCover, events (gcRenderEvents,
loadSidebarEvents), gcDemoGroups / gcDemoEvents.

Check: are demo groups/events ever shown as if real; group creation limits and
name abuse; who moderates a group; leaving a group; voting twice; group posts
from people not in the group; cover upload validation; and the empty state
for signed-out visitors (we now hide "Your groups" for guests).
```

## 10. Messages

```
Audit dm*: dmLoadConversations, dmLoadThread, dmSubscribe, dmSendReal,
dmNewConvo / dmNewSearch, dm_privacy, unread counts (on_message_sent trigger),
and the chat page frame (initChatFrame).

Check: messaging someone who blocked you, dm_privacy actually enforced by RLS,
4000-char cap, realtime leaking other people's messages (subscription
filters), unread badge drift, very long threads, and message deletion vs the
Privacy Policy's promises.
```

## 11. Notifications and push

```
Audit nf*: nfLoad, nfStartRealtime, nfMarkAllRead, nfBootCount, and web push
(FAERO_VAPID_PUBLIC_KEY is null; the send-push Edge Function is NOT deployed —
it returns 404).

Check: what the UI says when push is unavailable, notification rows created
by triggers vs by the client (can a client forge a notification for someone
else?), notifications from blocked users, and whether we should deploy
send-push and generate VAPID keys before launch or hide the toggle.
```

## 12. Radio

```
Audit faero_space.js Radio: ensureRadio, loadStations, rb() mirror fallback,
normStation (https only), the player dock (playStation, togglePlay, stopRadio,
paintDock), recently played (localStorage), and Put on my space.

Check: stations that 404 or stall (does the UI recover?), autoplay rules on
iOS Safari, the dock vs the mobile tab bar vs the join bar, playing while
Booth records audio, Media Session controls (lock screen), station names with
emoji or RTL text, the featured "Lofi Hip Hop" zeno.fm stream being down, and
Radio Browser's request for a descriptive User-Agent (browsers can't set one —
should we proxy?).
```

## 13. Booth

```
Audit apps/photobooth.html and its messages to the app (FAERO_BOOTH_POST,
FAERO_BOOTH_HIDE / SHOW, TOAST) in faero_space.js.

Already verified with a fake camera: filters, stickers / text / date / frames
in the saved photo, 4-shot strips, post handoff, camera stop on hide. Go
further on REAL devices: iPhone Safari (getUserMedia inside an iframe, the
allow="camera" attribute, MediaRecorder mp4), Android Chrome, front/back
flip, permission denied then granted, very low light, recording 2+ minutes
(memory), 8-shot strips on a slow phone, and the Privacy Policy's promise that
nothing leaves the device unless posted.
```

## 14. Safety: block, mute, report, ban, moderator panel

```
Audit faeroBlockUser / faeroUnblockUser / faeroLoadBlockList, faeroReportPost /
faeroSubmitReport (posts and profiles), faeroOpenAdmin / adm* (report queue,
admResolveReport, admReportDeletePost, profile reports' Clear profile space),
faeroOpenBanModal / faeroConfirmBan, faeroCheckBan, is_staff(), and the role
column guard (guard_profile_privileges).

Check: a banned user's existing session (can they keep posting until reload?),
what blocked users can still see or do via the API, reports on content that's
since been deleted, mods banning admins, an admin demoting themselves, the
audit trail for mod actions, and whether reporters are ever exposed.
```

## 15. Settings and customisation

```
Audit the settings sheet (fs*), themes and palettes (applyPalette,
buildPalettes), fonts (faeroLoadFont, faeroApplyFont — everything now uses
var(--font-body), Exo 2 by default), glass level, custom hue, avatar frame
badges (buildBadgePicker / selectBadge), accessibility toggles, nav style.

Check: every palette for contrast (text on cards, buttons, the new Radio /
Booth / space parts), fonts loaded from Google on demand, preferences that
should sync across devices but only live in localStorage, reduced-motion, and
dark palettes with the light-only parts (Booth, the space stage colours).
```

## 16. Your data: download and delete

```
Audit "Download my data" and "Delete my account" end to end. Deletion is now:
request_account_deletion() (sql/11: scrubs, clears space and the newer
columns, sets deleted_at via the faero.deleting flag) → delete-account Edge
Function (deployed, verify_jwt on) → auth user removed → profile row cascades.

Check: the export includes everything the Privacy Policy lists (including
profile space, guestbook notes you wrote, messages, reports you filed);
deletion from a phone; deletion when the Edge Function fails half way;
purge_deleted_accounts() is never scheduled (is a cron needed now?); images on
Cloudinary are NOT deleted (unsigned uploads) — decide whether to add a signed
cleanup function or change the Privacy Policy wording.
```

## 17. Signed-out visitors, navigation and routing

```
Audit the guest experience and routing: body.fx-guest (faero_space.js /
faero_space.css), faeroShowGuestBar (the slim join bar), the Profile tab
welcome panel, navigate / renderPage / PAGES, hash routes, the back button,
the top nav, side nav cards, and the phone tab bar (7 items).

Check: every page signed out at 375px and 1280px; anything still empty or
dashed; links that need an account but don't say so; back/forward through
#profile/x → #/radio → #post/y; refreshing on every route; the join bar
overlapping the player or the last post; and the faero.net → www redirect.
```

## 18. Database and RLS, table by table

```
Audit the database itself. Using the Supabase Management API (token in a
file I'll give you; read-only queries only unless I approve), list every
table in public with RLS on/off and every policy (pg_policies), every
SECURITY DEFINER function and who can EXECUTE it, and every trigger.

For each table: can anon read it? can a signed-in user read, insert, update
or delete someone else's rows? are there columns a user can write that they
shouldn't (role, counts, deleted_at, is_og — guarded by
guard_profile_privileges)? Compare with sql/ so we know if the live database
has drifted from the repo. Also check the beta/ waitlist page's separate
Supabase project (pvqxsgqqlupldroooyhy): is its waitlist table readable?
```

## 19. Security sweep

```
Do a security pass on the whole front end: every innerHTML / insertAdjacentHTML
sink and whether its data goes through faeroEsc / faeroSafeUrl / faeroJsArg;
inline onclick handlers built from user data; postMessage listeners and their
origin checks (Booth, profile styles); URLs from the database placed in
href/src; vercel.json and _headers (CSP is only frame-ancestors — write a real
policy and list what it would break); secrets committed to the repo (search
for keys, tokens, service_role); and which repo files Vercel publishes
(simulate .vercelignore with git check-ignore).
```

## 20. Offline, service worker and caching

```
Audit sw.js (CACHE_VERSION is now beta.10), what it precaches, what it never
caches, the offline fallback, and update behaviour.

Check: a returning visitor after a deploy gets the new files (we hit stale
faero_space.js / .css during development several times); offline launch;
Supabase calls while offline; the installed PWA (manifest shortcuts Radio /
Booth); and whether CACHE_VERSION bumping should be automated at deploy.
```

## 21. Performance, phones and accessibility

```
Measure and fix: first load size of faero_v1_launch.html (~770 KB inline) and
what can be deferred; fonts; the animated avatar canvases (initAllCanvases,
globalLoop) on a low-end phone; long feeds; Booth CPU while the camera runs.
Then an accessibility pass: keyboard-only through sign-up → post → profile
space editor → Radio → Booth; focus traps in sheets and modals; aria labels on
icon buttons; colour contrast; screen reader announcements for toasts.
```

## 22. Launch checklist: legal, SEO, deploy, monitoring

```
Final launch audit:
- DNS: faero.net (apex) still fails because of the stale A record
  162.255.119.204 — confirm it's gone (curl -I https://faero.net/).
- Merge: launch-security-and-games → main, then check www.faero.net serves
  faero_space.js and the new legal pages.
- Legal: read privacy.html and terms.html against what the code actually does
  today (Privacy 1.1 / Terms 2026-10-31). Note the Cloudinary deletion gap.
- Monitoring: the log-error Edge Function is NOT deployed (404), so client
  errors go nowhere — deploy it or turn the collector off.
- SEO: sitemap.xml, robots.txt, llms.txt, og-card.jpg, canonical tags.
- beta/ waitlist: still live, separate Supabase project — keep, lock down or
  retire?
- BETA_LAUNCH_CHECKLIST.md: go through it and mark what's done.
```
