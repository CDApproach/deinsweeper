// Offline-Cache. Bei Änderungen an den Dateien VERSION erhöhen,
// damit installierte Apps die neue Version laden.
const VERSION = 'deinsweeper-v6';
const FILES = [
  './', 'index.html', 'manifest.webmanifest?v=5', 'css/style.css',
  'js/main.js', 'js/core.js', 'js/config.js', 'js/online.js', 'js/worker.js', 'js/audio.js', 'js/fx.js', 'js/icons.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  // cache: 'reload' – frisch vom Server, nicht aus dem Browser-Cache.
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Erst Netz (damit Updates sofort ankommen), offline aus dem Cache.
// 'no-cache' fragt immer beim Server nach, ob sich die Datei geändert hat –
// sonst hält der Browser alte Dateien (z. B. das Manifest mit dem App-Namen)
// bis zu 10 Minuten fest.
self.addEventListener('fetch', (e) => {
  // Nur die Spieldateien cachen – Anfragen an die Weltrangliste gehen immer ans Netz.
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  const fresh = e.request.mode === 'navigate'
    ? new Request(url.href, { cache: 'no-cache', credentials: 'same-origin' })
    : new Request(e.request, { cache: 'no-cache' });
  e.respondWith(
    fetch(fresh)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
