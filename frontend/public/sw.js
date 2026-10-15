/* Parvsetu service worker — caches the app shell and static assets ONLY.
 * API responses are NEVER cached: a scan verdict, token, or permission must
 * always come fresh from the server. Any request to another origin (the API
 * runs on its own origin) or to a path containing /api/ bypasses this worker.
 */
const VERSION = 'parvsetu-shell-v4';
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

// ─── Notifications (web push) ────────────────────────────────────────────
// The API sends { title, body, url, tag }. Tapping opens (or focuses) that page.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Parvsetu', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Parvsetu', {
      body: data.body || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: data.tag,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === target && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});
