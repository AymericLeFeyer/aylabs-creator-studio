/**
 * Un **angle de vue** : plan large, plan serré, insert, face caméra, B-roll…
 *
 * Il ne sert pas à ranger le script, il sert à **le tourner** : on marque la phrase qui
 * doit être dite en gros plan, celle qui passe en voix off sur du B-roll, et on part
 * filmer en sachant quoi faire de chaque paragraphe. Sur le papier ça se note en marge ;
 * dans un script écrit, la marge n'existe pas — d'où le fond coloré directement sur le
 * passage concerné.
 *
 * Deux origines, exactement comme les tâches d'étape :
 *
 * - `ShotAngle` est le **référentiel** : les angles qu'on utilise sur toutes les vidéos,
 *   configurés une fois dans les paramètres. Ce sont des lignes et non des colonnes — en
 *   ajouter un ne demande aucune migration.
 * - `ProductionShotAngle` est **ponctuel** : « depuis le drone », « plan sur l'établi »
 *   n'a de sens que sur cette vidéo-là, et le mutualiser encombrerait toutes les autres
 *   d'un angle qu'on n'utilisera plus jamais.
 *
 * La **couleur est ce qui se lit**, pas l'identifiant : c'est elle qu'on reconnaît d'un
 * coup d'œil dans un script de trois pages, et elle est donc attribuée en rotation à la
 * création comme pour les marques et les chaînes — jamais une teinte par défaut unique,
 * qui rendrait six angles indistinguables.
 */
export interface ShotAngle {
  id: string;
  label: string;
  /** Comment on le tourne concrètement. Facultatif, affiché en aide dans le menu. */
  description: string | null;
  color: string;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateShotAngleInput {
  label: string;
  description?: string | null;
  color?: string;
  sortOrder?: number;
}

export type UpdateShotAngleInput = Partial<CreateShotAngleInput> & {
  isArchived?: boolean;
};

/** Un angle propre à une seule vidéo. */
export interface ProductionShotAngle {
  id: string;
  productionId: string;
  label: string;
  description: string | null;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductionShotAngleInput {
  productionId: string;
  label: string;
  description?: string | null;
  color?: string;
}

export type UpdateProductionShotAngleInput = {
  label?: string;
  description?: string | null;
  color?: string;
  sortOrder?: number;
};

/**
 * Un angle tel que l'éditeur le propose : les deux origines réunies, à plat.
 *
 * `origin` sert au front à savoir ce qu'il peut modifier depuis une fiche — un angle du
 * référentiel se retire dans les paramètres, jamais depuis une vidéo, sinon il
 * disparaîtrait de toutes les autres. Même contrat que `TodoItem`.
 */
export interface ShotAngleItem {
  id: string;
  label: string;
  description: string | null;
  color: string;
  origin: 'global' | 'production';
  sortOrder: number;
}
