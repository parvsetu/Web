/* Parvsetu service worker — caches the app shell and static assets ONLY.
 * API responses are NEVER cached: a scan verdict, token, or permission must
 * always come fresh from the server. Any request to another origin (the API
 * runs on its own origin) or to a path containing /api/ bypasses this worker.
 */
const VERSION = 'parvsetu-shell-v3';
// '/launch' is the home-screen start_url (routes to dashboard / My passes / explore);
// '/book/my-passes' lists the passes saved on this phone, which open offline.
const SHELL = ['/', '/launch', '/book/my-passes', '/dashboard', '/login', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => Promise.all(SHELL.map((u) => cache.add(u).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isStatic(url) {
  return (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    /\.(?:js|css|woff2?|png|svg|ico|webp)$/.test(url.pathname)
  );
}

/**
 * Offline navigation: the page itself if it was opened before; a pass link
 * that wasn't falls back to My passes (whose saved passes open offline);
 * anything else to the explore page.
 */
async function offlinePage(req, url) {
  const hit = await caches.match(req);
  if (hit) return hit;
  if (url.pathname.startsWith('/pass/')) {
    const passes = await caches.match('/book/my-passes');
    if (passes) return passes;
  }
  return (await caches.match(url.pathname, { ignoreSearch: true })) || caches.match('/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Never touch API traffic or anything cross-origin.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/api/')) return;
  if (req.headers.has('authorization')) return;

  if (isStatic(url)) {
    // Cache-first for immutable build assets.
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok && res.type === 'basic') {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === 'navigate') {
    // Network-first for pages; fall back to the cached shell when offline.
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => offlinePage(req, url)),
    );
  }
});
