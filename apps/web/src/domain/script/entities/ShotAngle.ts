/**
 * Un **angle de vue** : plan large, face caméra, insert, B-roll…
 *
 * Il ne range pas le script, il sert à **le tourner** : on marque la phrase qui doit
 * être dite en gros plan, celle qui passe en voix off, et on part filmer en sachant quoi
 * faire de chaque paragraphe. Duplique le contrat de l'API.
 */
export interface ShotAngle {
  id: string;
  label: string;
  description: string | null;
  color: string;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ShotAngleInput {
  label: string;
  description?: string | null;
  color?: string;
}

/**
 * Un angle tel que l'éditeur le propose : référentiel et ponctuels réunis, à plat.
 *
 * `origin` dit ce qu'on a le droit de modifier depuis une fiche de vidéo — un angle du
 * référentiel se retire dans les paramètres, sinon il disparaîtrait de toutes les autres
 * vidéos. Même contrat que `TodoItem`.
 */
export interface ShotAngleItem {
  id: string;
  label: string;
  description: string | null;
  color: string;
  origin: 'global' | 'production';
  sortOrder: number;
}
