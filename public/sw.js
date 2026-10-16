// CampusLoop service worker: app shell network-first (always the latest code, cached copy when offline), API always network.
const V = 'cl-v7'; // bump when the shell file list changes
const SHELL = ['/', '/index.html', '/css/app.css', '/js/app.js', '/js/core.js', '/js/i18n/index.js', '/js/i18n/ta.js',
  '/js/views/home.js', '/js/views/market.js', '/js/views/tasks.js', '/js/views/deal.js', '/js/views/activity.js', '/js/views/chat.js',
  '/js/views/profile.js', '/js/views/wallet.js', '/js/views/community.js', '/js/views/settings.js', '/js/views/notifications.js', '/js/views/auth.js', '/js/views/admin.js',
  '/fonts/bricolage-grotesque-latin-400-normal.woff2', '/fonts/bricolage-grotesque-latin-600-normal.woff2', '/fonts/bricolage-grotesque-latin-800-normal.woff2',
  '/icons/icon.svg', '/icons/icon-192.png', '/manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(V).then((c) => c.addAll(SHELL.map((p) => new Request(p, { cache: 'reload' })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  // network-first: serving the cache first left people on old screens after an update (e.g. a missing admin tab);
  // the cached copy is only used when the network is unavailable
  e.respondWith(caches.open(V).then(async (c) => {
    try {
      const r = await fetch(e.request, { cache: 'no-cache' });
      if (r.ok) c.put(e.request, r.clone());
      return r;
    } catch {
      return (await c.match(e.request, { ignoreSearch: true })) || c.match('/index.html');
    }
  }));
});
