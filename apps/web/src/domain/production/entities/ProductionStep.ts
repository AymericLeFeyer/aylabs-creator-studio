/** Contrat de `/api/production-steps`. */

export interface ProductionStep {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  /**
   * Durée moyenne du travail, en minutes. `null` et non zéro : « je ne sais pas » et
   * « ça ne prend pas de temps » sont deux réponses différentes, et c'est la première
   * qui fait chercher ailleurs. Le planning s'en sert pour savoir quelle place réserver.
   */
  defaultMinutes: number | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionStepInput {
  name: string;
  color?: string;
  sortOrder?: number;
  defaultMinutes?: number | null;
  isArchived?: boolean;
}
