/* Service worker We POS (dibuat otomatis oleh scripts/build-sw.mjs) */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const scope = new URL(self.registration.scope);
const abs = (u) => new URL(u, scope).href;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE.map(abs))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wepos-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  // Hanya file aplikasi sendiri; request ke Dexie Cloud dibiarkan lewat.
  if (req.method !== 'GET' || url.origin !== scope.origin) return;
  if (req.mode === 'navigate') {
    // Halaman: coba jaringan dulu (cepat dapat versi terbaru), fallback ke cache saat offline.
    e.respondWith(fetch(req).catch(async () =>
      (await caches.match(req, { ignoreSearch: true })) ||
      (await caches.match(abs(url.pathname.endsWith('/') ? url.pathname : url.pathname + '/'))) ||
      caches.match(abs('./'))));
    return;
  }
  // Aset (JS/CSS/ikon, nama file ber-hash): cache dulu.
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok && url.pathname.includes('/_astro/')) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
    return res;
  })));
});
