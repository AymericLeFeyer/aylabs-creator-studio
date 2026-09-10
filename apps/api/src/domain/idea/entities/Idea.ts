import type { ProductionFormat } from '../../production/entities/Production.ts';

/**
 * Une idée jetée en vrac, avant de savoir si elle fera une vidéo.
 *
 * Volontairement pauvre : un texte, et rien d'autre. Lui donner des dates, un statut ou
 * une chaîne en ferait une production au rabais — or c'est justement l'absence de tout
 * ça qui permet de la noter en trois secondes. Le jour où elle mérite mieux, le bouton
 * « en faire une vidéo » la promeut en `Production` et la retire du carnet.
 *
 * `format` n'est pas un champ qu'on remplit : il vient de l'écran où l'idée est notée
 * (« Vidéos » ou « Shorts & Réels »), et c'est lui qui décide dans quel carnet elle se
 * relit et quel format prend la vidéo qu'elle devient.
 */
export interface Idea {
  id: string;
  text: string;
  format: ProductionFormat;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIdeaInput {
  text: string;
  format?: ProductionFormat;
}

export type UpdateIdeaInput = Partial<CreateIdeaInput>;
