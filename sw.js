// Service worker: rende i file dell'app utilizzabili offline quando pubblicata su GitHub Pages / HTTPS.
const CACHE = 'guidapa-v8';
const FILES = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './percorso.js',
  './cloud_ai.js',
  './tour.js',
  './qrcode.js',
  './data.js',
  './manifest.json',
  './icon.svg',
  './manuale.html',
  './Manuale_Uso_GuidaPA.pdf'
];

self.addEventListener('install', e =>
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()))
);

self.addEventListener('activate', e =>
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
);

// Intercetta solo i file statici dello stesso dominio (non intercetta mai JSONBin.io o Google Gemini).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
