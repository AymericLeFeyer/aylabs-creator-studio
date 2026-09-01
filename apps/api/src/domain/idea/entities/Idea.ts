/**
 * Une idée jetée en vrac, avant de savoir si elle fera une vidéo.
 *
 * Volontairement pauvre : un texte, et rien d'autre. Lui donner des dates, un statut ou
 * une chaîne en ferait une production au rabais — or c'est justement l'absence de tout
 * ça qui permet de la noter en trois secondes. Le jour où elle mérite mieux, le bouton
 * « en faire une vidéo » la promeut en `Production` et la retire du carnet.
 */
export interface Idea {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateIdeaInput {
  text: string;
}

export type UpdateIdeaInput = Partial<CreateIdeaInput>;
