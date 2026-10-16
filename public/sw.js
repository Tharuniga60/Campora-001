// CampusLoop service worker: app shell cache-first (instant loads, works offline), API always network.
const V = 'cl-v1';
const SHELL = ['/', '/index.html', '/css/app.css', '/js/app.js', '/js/core.js', '/js/i18n.js', '/js/ta.js',
  '/js/views/home.js', '/js/views/market.js', '/js/views/tasks.js', '/js/views/deal.js', '/js/views/activity.js', '/js/views/chat.js',
  '/js/views/profile.js', '/js/views/wallet.js', '/js/views/community.js', '/js/views/settings.js', '/js/views/notifications.js', '/js/views/auth.js', '/js/views/admin.js',
  '/fonts/bricolage-grotesque-latin-400-normal.woff2', '/fonts/bricolage-grotesque-latin-600-normal.woff2', '/fonts/bricolage-grotesque-latin-800-normal.woff2',
  '/icons/icon.svg', '/icons/icon-192.png', '/manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // stale-while-revalidate: instant from cache, refresh in background
  e.respondWith(caches.open(V).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const net = fetch(e.request).then((r) => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit || c.match('/index.html'));
    return hit || net;
  }));
});
