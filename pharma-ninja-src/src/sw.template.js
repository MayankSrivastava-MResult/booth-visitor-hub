/* =====================================================================
 * PHARMA NINJA — service worker (Hub mode only; served as /play-sw.js,
 * scope /play). Keeps the game page available with no network:
 *   - install: stores the current /play page in the cache
 *   - fetch:   navigations to /play (any ?query) are answered from the cache
 *              at once, and refreshed from the network in the background,
 *              so a new build is picked up on the next load
 *   - nothing else is touched: Hub API calls always go to the network
 *     (the game handles their failure itself)
 * build.py fills in the version placeholder in CACHE with a hash of the built page.
 * ===================================================================== */
var CACHE = 'pharma-ninja-__VERSION__';
var PAGE = '/play';

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.add(new Request(PAGE, { cache: 'reload' })); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf('pharma-ninja-') === 0 && k !== CACHE; })
          .map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname !== PAGE) return;
  event.respondWith(caches.open(CACHE).then(function (cache) {
    var refresh = fetch(new Request(PAGE, { cache: 'no-cache' }))
      .then(function (res) { if (res && res.ok && !res.redirected) cache.put(PAGE, res.clone()); return res; });
    return cache.match(PAGE).then(function (cached) {
      if (cached) {
        event.waitUntil(refresh.catch(function () {}));   // offline: keep the cached copy
        return cached;
      }
      return refresh;                                     // first visit: needs the network once
    });
  }));
});
