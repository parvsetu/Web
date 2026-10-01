/* Parvsetu service worker — caches the app shell and static assets ONLY.
 * API responses are NEVER cached: a scan verdict, token, or permission must
 * always come fresh from the server. Any request to another origin (the API
 * runs on its own origin) or to a path containing /api/ bypasses this worker.
 */
const VERSION = 'parvsetu-shell-v1';
const SHELL = ['/', '/login', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon.svg'];

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
        .catch(() => caches.match(req).then((hit) => hit || caches.match('/'))),
    );
  }
});
