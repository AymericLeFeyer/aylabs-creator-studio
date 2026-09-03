/**
 * Enregistrement du service worker.
 *
 * **Uniquement en production.** En développement, Vite sert les modules un par un et les
 * remplace à chaud : un service worker qui s'intercalerait servirait des versions
 * périmées et ferait passer le rechargement à chaud pour cassé — c'est le piège classique,
 * et il coûte une demi-heure à diagnostiquer.
 *
 * L'échec est **avalé** : un service worker est un confort (lancement hors ligne, icône
 * sur l'écran d'accueil), jamais une condition de fonctionnement. Un contexte non
 * sécurisé, un navigateur en navigation privée ou une politique d'entreprise qui les
 * interdit ne doivent pas empêcher l'application de démarrer.
 */
export const registerServiceWorker = (): void => {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  // Après `load` : l'enregistrement entre en concurrence avec le premier rendu pour la
  // bande passante, et la coquille doit s'afficher en premier.
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.warn('[pwa] service worker non enregistré', error);
    });
  });
};
