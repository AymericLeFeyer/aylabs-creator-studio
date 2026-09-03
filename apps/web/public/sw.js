/**
 * Service worker de Creator Studio.
 *
 * Écrit à la main plutôt qu'avec Workbox / `vite-plugin-pwa`, pour la même raison que le
 * reste du projet (le Gantt, les confettis, le combobox de marques) : le besoin tient en
 * cinquante lignes, et une chaîne de génération de service worker ajoute une dépendance
 * de build, un fichier généré à ne pas relire, et une couche de plus à déboguer le jour
 * où le cache se comporte mal.
 *
 * **Aucune liste d'assets à précacher n'est figée ici.** C'est le point qui rend un
 * service worker maison fragile d'habitude : les fichiers de `dist/assets/` portent un
 * hash différent à chaque build, et une liste écrite en dur pointerait sur la version
 * précédente dès le déploiement suivant. La stratégie est donc déduite du type de
 * requête, pas d'un inventaire :
 *
 * | Requête                      | Stratégie             | Pourquoi                                                                 |
 * | ---------------------------- | --------------------- | ------------------------------------------------------------------------ |
 * | Navigation (une page)        | réseau, cache en repli | en ligne on veut toujours le dernier `index.html` — donc les derniers assets |
 * | `/assets/*` (hashés)         | cache d'abord         | le hash est dans le nom : le contenu ne change jamais                    |
 * | Icônes, manifeste            | cache d'abord         | ils changent une fois par an                                             |
 * | `/api/*`                     | **jamais de cache**   | servir des revenus périmés est pire que ne rien servir                   |
 *
 * Conséquence assumée : hors ligne, l'application se lance et affiche sa coquille, mais
 * les écrans restent vides — les données viennent de l'API. C'est le comportement voulu :
 * un tableau de bord financier qui afficherait des chiffres d'il y a trois jours sans le
 * dire ferait plus de dégâts qu'un écran vide.
 */

/** Change à chaque évolution de la logique ci-dessous : l'ancien cache est alors purgé. */
const CACHE = 'creator-studio-v1';

/**
 * La coquille minimale, mise en cache à l'installation.
 * Uniquement des chemins **stables** : aucun nom de fichier haché ne peut figurer ici.
 */
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // `addAll` échoue en bloc si une seule requête échoue : on tolère les manquantes
      // plutôt que de laisser l'installation entière échouer sur une icône.
      .then((cache) => Promise.allSettled(SHELL.map((path) => cache.add(path))))
      // La nouvelle version prend la main tout de suite : sans ça elle attendrait la
      // fermeture de tous les onglets, et un correctif urgent resterait invisible.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

/** Les fichiers dont le nom porte un hash, ou qui ne changent qu'au fil des années. */
const isImmutable = (url) =>
  url.pathname.startsWith('/assets/') ||
  url.pathname.endsWith('.png') ||
  url.pathname.endsWith('.ico') ||
  url.pathname.endsWith('.webmanifest');

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // On ne touche ni aux écritures ni aux requêtes d'autres origines : un service worker
  // qui met en cache un POST casse silencieusement l'application.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Les données ne sont jamais mises en cache : mieux vaut une erreur franche qu'un
  // chiffre d'affaires périmé affiché comme s'il était à jour.
  if (url.pathname.startsWith('/api/')) return;

  // Navigation : le réseau d'abord, pour toujours repartir du dernier `index.html`.
  // Hors ligne, on retombe sur la coquille en cache — l'application se lance, et
  // TanStack Query affichera ses propres erreurs de chargement.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put('/index.html', copy));
          return response;
        })
        .catch(() => caches.match('/index.html').then((cached) => cached ?? Response.error())),
    );
    return;
  }

  if (!isImmutable(url)) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        // Une réponse partielle ou opaque n'a rien à faire en cache : elle ressortirait
        // telle quelle au prochain chargement.
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    }),
  );
});
