const CACHE = 'trener-v118';
const ASSETS = [
  './',
  'index.html',
  'css/styles.css',
  'js/app.js',
  'js/exercise-icons.js',
  'js/live.js',
  'js/calendar.js',
  'js/gcal.js',
  'js/chat.js',
  'js/habits.js',
  'js/cloud.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/bg-gym.jpg',
  'icons/hero.jpg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const fromNetwork = (req) =>
  fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? 'index.html' : req, copy));
    }
    return res;
  });

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  // Stránka (HTML): okamžite z pamäte → čierna úvodná obrazovka hneď, bez bieleho záblesku.
  // Najnovšia verzia sa stiahne na pozadí a použije sa pri ďalšom spustení.
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match('index.html').then((cached) => {
        const net = fromNetwork(req);
        if (cached) { e.waitUntil(net.catch(() => {})); return cached; }
        return net.catch(() => caches.match('index.html'));
      })
    );
    return;
  }

  // Ostatné súbory: najnovšie zo siete; pri pomalom alebo žiadnom internete (2,5 s) z pamäte.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      const net = fromNetwork(req);
      if (!cached) return net;
      const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), 2500));
      return Promise.race([net.catch(() => cached), timeout]);
    })
  );
});
