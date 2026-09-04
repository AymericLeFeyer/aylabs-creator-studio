/**
 * Les tâches d'une étape : ce qu'il y a réellement à faire dans « montage » ou
 * « miniature ».
 *
 * Deux origines, une seule façon de les cocher.
 *
 * - `StepTodo` est le **référentiel** : les tâches habituelles d'une étape, configurées
 *   une fois dans les paramètres et proposées sur toutes les vidéos. Ce sont des lignes
 *   et non des colonnes, exactement comme les étapes : en ajouter une ne demande pas de
 *   migration.
 * - `ProductionTodo` est **ponctuel** : « demander l'autorisation pour la musique »
 *   n'a de sens que sur cette vidéo-là, et la mutualiser obligerait à la cocher sur
 *   toutes les autres.
 *
 * Les deux se cochent dans la même table, où la **présence de la ligne vaut « fait »** —
 * même mécanique que les étapes, et la date de complétion vient gratuitement.
 */
export interface StepTodo {
  id: string;
  stepId: string;
  label: string;
  /** Durée moyenne, en minutes. `null` = retombe sur celle de l'étape. */
  defaultMinutes: number | null;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateStepTodoInput {
  stepId: string;
  label: string;
  defaultMinutes?: number | null;
  sortOrder?: number;
}

export type UpdateStepTodoInput = Partial<Omit<CreateStepTodoInput, 'stepId'>> & {
  isArchived?: boolean;
};

/** Tâche ajoutée sur une seule vidéo. `stepId` la range sous la bonne étape. */
export interface ProductionTodo {
  id: string;
  productionId: string;
  stepId: string | null;
  label: string;
  defaultMinutes: number | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductionTodoInput {
  productionId: string;
  stepId?: string | null;
  label: string;
  defaultMinutes?: number | null;
}

export type UpdateProductionTodoInput = {
  label?: string;
  stepId?: string | null;
  defaultMinutes?: number | null;
  sortOrder?: number;
};

/**
 * Une tâche telle que la fiche l'affiche : les deux origines réunies, à plat.
 * `origin` sert au front à savoir ce qu'il peut supprimer — une tâche du référentiel se
 * retire dans les paramètres, pas depuis une vidéo.
 */
export interface TodoItem {
  id: string;
  stepId: string | null;
  label: string;
  /** Durée moyenne retenue pour le planning, `null` si personne ne l'a renseignée. */
  defaultMinutes: number | null;
  origin: 'step' | 'production';
  checked: boolean;
  checkedAt: string | null;
  sortOrder: number;
}
