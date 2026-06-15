const CACHE_NAME = 'fpl-editor-v3'; // IMPORTANT : J'incrémente la version à v3
const urlsToCache = [
  '/',
  'index.html',
  'style.css',
  'app.js',
  'geoUtils.js',
  'generators.js',
  'fileHandlers.js',
  'icon-192x192.png',
  'icon-512x512.png'
];

// Installation du Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Interception des requêtes
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Gérer la requête de partage de fichier (POST)
  if (event.request.method === 'POST' && url.pathname.endsWith('index.html')) {
    event.respondWith(Response.redirect('/index.html'));
    event.waitUntil(async function () {
      const formData = await event.request.formData();
      const file = formData.get('fplfile');
      if (!file) return;

      const client = await self.clients.get(event.resultingClientId || event.clientId);
      if (client) {
        client.postMessage({ file: file, type: 'FILE_SHARE' });
      }
    }());
    return; // Important : on arrête ici pour le POST
  }

  // Gérer les requêtes GET avec une stratégie "cache-first"
  // On ignore toutes les autres requêtes (non-GET, non-POST)
  if (event.request.method === 'GET') {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          // Si on trouve dans le cache, on le renvoie, sinon on va sur le réseau
          return response || fetch(event.request);
        })
    );
  }
});


// Nettoyage des anciens caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});