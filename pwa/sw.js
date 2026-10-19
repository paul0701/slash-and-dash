var CACHE = 'slashdash-v10';
var CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

var FONT_CSS = 'https://fonts.googleapis.com/css2?family=Creepster&display=swap';

function cacheFont(c) {
  return fetch(FONT_CSS).then(function (res) {
    var copy = res.clone();
    return res.text().then(function (css) {
      var urls = css.match(/https:\/\/fonts\.gstatic\.com[^)'"]+/g) || [];
      return Promise.all([c.put(FONT_CSS, copy)].concat(urls.map(function (u) {
        return fetch(u).then(function (r) { return c.put(u, r); });
      })));
    });
  }).catch(function () {});
}

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(CORE).then(function () { return cacheFont(c); }); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.indexOf('/api/') === 0) return;
  if (url.origin === location.origin) {
    // network first so updates show up, cache as the offline fallback
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (r) { return r || caches.match('index.html'); });
      })
    );
  } else if (url.hostname.indexOf('fonts.g') === 0) {
    // cache the game font after the first visit so it works offline
    e.respondWith(
      caches.match(req).then(function (r) {
        return r || fetch(req).then(function (res) {
          var copy = res.clone();
          caches.open(CACHE).then(function (c) { c.put(req, copy); });
          return res;
        });
      })
    );
  }
});
