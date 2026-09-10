/** Contrat de `/api/ideas`. */

import type { ProductionFormat } from '../../production/entities/Production.ts';

/**
 * Une idée jetée en vrac. Un texte et rien d'autre : c'est l'absence de champs qui
 * permet de la noter en trois secondes. Le bouton « en faire une vidéo » la promeut
 * en production et la retire du carnet.
 *
 * `format` vient de l'écran où elle est notée — jamais d'un champ à remplir — et décide
 * du carnet où elle se relit.
 */
export interface Idea {
  id: string;
  text: string;
  format: ProductionFormat;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaInput {
  text: string;
  format?: ProductionFormat;
}
