// Dishaara service worker: the app works offline once opened (forts often have weak signal).
// - Pages: network first, cached copy when offline.
// - Built files (/assets/...): cache first, they never change name without changing content.
// - Map tiles and fonts: stale while revalidate, capped so the phone does not fill up.
// - API calls are never cached: they must be fresh or fail visibly.
const VERSION = 'dishaara-v2';
const SHELL = `${VERSION}-shell`;
const TILES = `${VERSION}-tiles`;
const MAX_TILES = 400;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(['./', './manifest.webmanifest', './icon-192.png', './icon-512.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (e) => {
  const urls = (e.data && e.data.cache) || [];
  e.waitUntil(
    caches.open(SHELL).then(async (c) => {
      for (const u of urls) if (!(await c.match(u))) await c.add(u).catch(() => {});
    }),
  );
});

async function trim(name, max) {
  const c = await caches.open(name);
  const keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  const isTile = /tiles\.openfreemap\.org|fonts\.(googleapis|gstatic)\.com/.test(url.host);
  const isRoute = url.host === 'router.project-osrm.org';
  if (isTile || isRoute) {
    e.respondWith(
      caches.open(TILES).then(async (c) => {
        const hit = await c.match(req);
        const net = fetch(req)
          .then((r) => {
            if (r.ok) c.put(req, r.clone()).then(() => trim(TILES, MAX_TILES));
            return r;
          })
          .catch(() => hit);
        return hit || net;
      }),
    );
    return;
  }

  if (url.origin !== self.location.origin) return; // backend and anything else: straight to network
  if (url.pathname.startsWith('/api/')) return; // the deployed backend shares the site: never cache it

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          caches.open(SHELL).then((c) => c.put('./', r.clone()));
          return r;
        })
        .catch(() => caches.match('./')),
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((r) => {
          if (r.ok) caches.open(SHELL).then((c) => c.put(req, r.clone()));
          return r;
        }),
    ),
  );
});
