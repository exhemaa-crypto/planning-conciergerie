const CACHE = 'planning-v2-cache-v11';
const ASSETS = [
  '/planning-conciergerie/',
  '/planning-conciergerie/index.html'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Ne JAMAIS intercepter : requêtes non-GET, et tout ce qui n'est pas notre propre origine
  // (en particulier firestore.googleapis.com pour la synchronisation)
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) {
    return; // laisse passer directement au réseau, sans cache
  }

  // RÉSEAU D'ABORD : toujours récupérer la dernière version en ligne,
  // et se rabattre sur le cache uniquement si hors-ligne.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && res.status === 200) {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return res;
    }).catch(() =>
      caches.match(e.request).then(r => r || caches.match('/planning-conciergerie/'))
    )
  );
});
