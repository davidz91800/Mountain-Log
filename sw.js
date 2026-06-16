const CACHE_NAME = 'fpl-editor-v8'; // IMPORTANT : incrémenter à chaque modif des fichiers en cache

// Ressources de base de l'application (le « shell »). Tout est mis en cache
// pour que l'app soit utilisable 100% hors connexion une fois installée.
const urlsToCache = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'geoUtils.js',
  'generators.js',
  'fileHandlers.js',
  'lz-string.min.js',
  'qrcode.min.js',
  'logo.png',
  'manifest.json',
  'icon-192x192.png',
  'icon-512x512.png'
];

// Installation : préchargement du shell. La mise en cache est tolérante aux
// erreurs (un fichier manquant ne fait plus échouer toute l'installation),
// et skipWaiting permet au nouveau Service Worker de prendre la main vite.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.allSettled(urlsToCache.map(url => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

// Activation : suppression des anciens caches + prise de contrôle immédiate
// des pages déjà ouvertes (clients.claim).
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('Suppression de l\'ancien cache :', name);
            return caches.delete(name);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// Interception des requêtes
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Gérer la requête de partage de fichier (POST)
  if (request.method === 'POST' && url.pathname.endsWith('index.html')) {
    event.respondWith(Response.redirect('/index.html'));
    event.waitUntil(async function () {
      const formData = await request.formData();
      const file = formData.get('fplfile');
      if (!file) return;

      const client = await self.clients.get(event.resultingClientId || event.clientId);
      if (client) {
        client.postMessage({ file: file, type: 'FILE_SHARE' });
      }
    }());
    return; // Important : on arrête ici pour le POST
  }

  // On ne gère que les GET de même origine. Le reste (ex : appels météo
  // Open-Meteo) passe directement au réseau, sans interception.
  if (request.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Requêtes de NAVIGATION (ouverture de l'app depuis l'écran d'accueil) :
  // on renvoie TOUJOURS le shell en cache. C'est la garantie d'un démarrage
  // hors connexion, quelle que soit l'URL de lancement (start_url).
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then(cached =>
        cached || fetch(request).catch(() => caches.match('index.html'))
      )
    );
    return;
  }

  // Autres ressources (JS, CSS, images, manifest) : « cache d'abord », avec
  // repli réseau et mise en cache à la volée de ce qui a été récupéré en
  // ligne (filet de sécurité si une ressource n'était pas préchargée).
  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(response => {
        if (response && response.status === 200 && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
