/** Contrat de `/api/ideas`. */

/**
 * Une idée jetée en vrac. Un texte et rien d'autre : c'est l'absence de champs qui
 * permet de la noter en trois secondes. Le bouton « en faire une vidéo » la promeut
 * en production et la retire du carnet.
 */
export interface Idea {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

export interface IdeaInput {
  text: string;
}
