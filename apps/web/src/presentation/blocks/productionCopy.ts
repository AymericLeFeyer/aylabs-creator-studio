import type { ProductionFormat } from '../../domain/production/entities/Production.ts';

/**
 * Ce qui change d'une file à l'autre : les mots, et rien d'autre. Composants, règles et
 * requêtes sont les mêmes — c'est tout l'intérêt d'un seul écran paramétré plutôt que de
 * deux copies qui divergeraient à la première retouche.
 *
 * Ce fichier n'exporte aucun composant (`react-refresh/only-export-components`).
 */
export const PRODUCTION_COPY: Record<
  ProductionFormat,
  {
    title: string;
    subtitle: string;
    create: string;
    empty: string;
    emptyDone: string;
    published: string;
    /** Le préfixe des blocs sur le dashboard : « Vidéos · En retard ». */
    group: string;
  }
> = {
  video: {
    title: 'Vidéos',
    group: 'Vidéos',
    published: 'Une vidéo publiée',
    subtitle: 'Ce qui est en cours, ce qui sort quand, et le temps que ça prend vraiment.',
    create: 'Nouvelle vidéo',
    empty: 'Aucune vidéo en production',
    emptyDone: "Aucune vidéo publiée depuis l'outil pour l'instant.",
  },
  short: {
    title: 'Shorts & Réels',
    group: 'Shorts & Réels',
    published: 'Un short publié',
    subtitle:
      'Les formats courts, à part des gros projets mais sur le même planning et avec les mêmes outils.',
    create: 'Nouveau short',
    empty: 'Aucun short en production',
    emptyDone: "Aucun short publié depuis l'outil pour l'instant.",
  },
};
