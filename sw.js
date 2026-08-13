/* Faero service worker — offline shell + cache hygiene.
   Strategy:
     • app shell (HTML/CSS/JS)  → network-first, cache fallback
     • fonts / images / CDN     → stale-while-revalidate
     • Supabase + Cloudinary API → never cached (always network)
   Bump CACHE_VERSION on every deploy to evict old shells. */

const CACHE_VERSION = 'faero-v1.0.0-beta.3';
const SHELL_CACHE   = `${CACHE_VERSION}-shell`;
const ASSET_CACHE   = `${CACHE_VERSION}-assets`;

// The app is reachable ONLY at the explicit filename on this origin.
//
// This list used to be [SHELL_HTML, './', '/'], which was right in the
// standalone-app repo: there a host rewrite made '/' and the filename the
// same document, so both spellings were the app. In faero OS they are two
// different pages — '/' is the desktop, and the social app is a window
// inside it. Keeping './' and '/' here meant any offline navigation that
// missed the cache (say a deep link to /apps/notepad.html) fell through and
// was served the social feed instead: the wrong app, looking like it worked.
//
// The desktop is deliberately not listed. It is not a PWA shell and was
// never designed to run offline, so a cache miss at '/' should surface the
// browser's offline page rather than silently substituting a different app.
const SHELL_HTML     = 'faero_v1_launch.html';
const SHELL_FALLBACK = [SHELL_HTML];

const SHELL = [
  SHELL_HTML,
  'faero_profile_native.css',
  // Loaded by a <script> tag in the page — omitting it meant the app opened
  // offline without its profile module.
  'faero_profile_native.js',
  'manifest.webmanifest',
  // Precached so an installed app doesn't show a broken icon on its first
  // offline launch.
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-192.png',
  'icons/icon-maskable-512.png',
  'icons/icon.svg',
  'icons/icon-maskable.svg',
];

const NEVER_CACHE = [
  'supabase.co',
  'api.cloudinary.com',
  '/auth/v1/',
  '/rest/v1/',
  '/realtime/v1/',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // addAll is atomic — one 404 kills the install, so tolerate misses
      .then(cache => Promise.allSettled(SHELL.map(u => cache.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !k.startsWith(CACHE_VERSION)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

function isApi(url) {
  return NEVER_CACHE.some(frag => url.includes(frag));
}

/* ── Web push ──────────────────────────────────────────────────────
   Payloads are sent by the send-push Edge Function. Everything is
   defensive: a malformed payload must still produce a notification
   rather than throwing inside the service worker. */

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (_) { data = { body: event.data ? event.data.text() : '' }; }

  const title = data.title || 'Faero';
  const options = {
    body:  data.body || '',
    icon:  'icons/icon.svg',
    badge: 'icons/icon-maskable.svg',
    tag:   data.tag || 'faero-' + (data.type || 'general'),
    renotify: false,
    data:  { url: data.url || 'faero_v1_launch.html' },
    // Grouping by tag means ten likes don't become ten banners.
    silent: false
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url || 'faero_v1_launch.html';

  // Focus an existing tab if Faero is already open, rather than piling up
  // duplicate windows.
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes('faero_v1_launch') && 'focus' in client) {
          client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = req.url;
  if (isApi(url) || url.startsWith('chrome-extension://')) return;   // straight to network

  // Navigations + the app shell: network-first so users get fresh code,
  // cache fallback so the app opens on the subway.
  if (req.mode === 'navigate' || url.endsWith('.html')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          // Try the exact request first, then every spelling of the shell.
          // A visitor who arrived at '/' has it cached under '/', not under
          // the filename, so a single hard-coded key missed them entirely.
          const exact = await caches.match(req);
          if (exact) return exact;
          for (const key of SHELL_FALLBACK) {
            const hit = await caches.match(key);
            if (hit) return hit;
          }
          return Response.error();
        })
    );
    return;
  }

  // Everything else: serve cache immediately, refresh in the background.
  event.respondWith(
    caches.match(req).then(hit => {
      const network = fetch(req)
        .then(res => {
          if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then(c => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
