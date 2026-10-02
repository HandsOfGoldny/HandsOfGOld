/* Hands of Gold - service worker
 * ------------------------------------------------------------------
 * BUMP CACHE_VERSION EVERY TIME YOU DEPLOY. That single line is what
 * throws away the old cached copies. HTML, CSS and JS are fetched
 * network-first on purpose, so a deploy is never hidden behind cache.
 * ------------------------------------------------------------------ */
var CACHE_VERSION = 'hog-20261002-astra-rebuild';

var PRECACHE = CACHE_VERSION + '-precache';
var RUNTIME  = CACHE_VERSION + '-runtime';

/* Small shell only. Video is never precached. */
var PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/style.css',
  '/script.js',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(PRECACHE).then(function (cache) {
      /* allSettled: one missing file must not abort the whole install */
      return Promise.allSettled(PRECACHE_URLS.map(function (url) {
        return cache.add(new Request(url, { cache: 'reload' }));
      }));
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== PRECACHE && key !== RUNTIME) { return caches.delete(key); }
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

var MEDIA = /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf)$/i;
var VIDEO = /\.(?:mp4|webm|mov|m4v)$/i;
var SHELL = /\.(?:html|css|js|json)$/i;

function putCopy(request, response) {
  if (!response || !response.ok || response.type !== 'basic') { return; }
  var copy = response.clone();
  caches.open(RUNTIME).then(function (cache) { cache.put(request, copy); });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') { return; }

  var url;
  try { url = new URL(request.url); } catch (e) { return; }

  /* Leave everything third-party alone: GTM, analytics, price APIs. */
  if (url.origin !== self.location.origin) { return; }

  /* Video uses byte-range requests. Caching it breaks seeking. */
  if (VIDEO.test(url.pathname)) { return; }
  if (url.pathname.indexOf('/api/') === 0) { return; }

  var isShell = request.mode === 'navigate' ||
                url.pathname === '/' ||
                url.pathname.charAt(url.pathname.length - 1) === '/' ||
                SHELL.test(url.pathname);

  if (isShell) {
    /* NETWORK FIRST - the network copy always wins when it is reachable. */
    event.respondWith(
      fetch(request).then(function (response) {
        putCopy(request, response);
        return response;
      }).catch(function () {
        return caches.match(request).then(function (hit) {
          if (hit) { return hit; }
          if (request.mode === 'navigate') { return caches.match('/offline.html'); }
          return Response.error();
        });
      })
    );
    return;
  }

  if (MEDIA.test(url.pathname)) {
    /* CACHE FIRST - photos and icons do not change under the same name. */
    event.respondWith(
      caches.match(request).then(function (hit) {
        if (hit) { return hit; }
        return fetch(request).then(function (response) {
          putCopy(request, response);
          return response;
        });
      })
    );
  }
});

/* Lets the page force an update without a reinstall. */
self.addEventListener('message', function (event) {
  if (event.data === 'hog-skip-waiting') { self.skipWaiting(); }
});
