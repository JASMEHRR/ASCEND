/*
 * Ascend Protocol service worker — minimal offline shell.
 *
 * Precaches the app shell so an installed PWA opens (and shows a friendly
 * offline page) without a network. Static assets are served cache-first;
 * navigations fall back to the cached shell when offline. API calls (/api/*)
 * are never cached — they must always hit the network (auth + live data).
 */
const CACHE = 'ascend-shell-v1';
const SHELL = ['/', '/index.html', '/manifest.json', '/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  // Never intercept API or cross-origin requests.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;

  // Navigations: network-first, fall back to the cached shell when offline.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html').then((r) => r || caches.match('/'))),
    );
    return;
  }

  // Static assets: cache-first, then network (and cache the result).
  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((resp) => {
          if (resp.ok && resp.type === 'basic') {
            const copy = resp.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return resp;
        }),
    ),
  );
});
