/**
 * Une étape du travail sur une vidéo : écriture, tournage, montage, miniature,
 * publication… et tout ce que tu voudras ajouter.
 *
 * Les étapes sont des **lignes, pas des colonnes** : en ajouter une ne demande pas de
 * migration, et l'ordre d'affichage (`sortOrder`) ne dit rien de l'ordre de réalisation
 * — les cases se cochent dans n'importe quel sens.
 */
export interface ProductionStep {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
  /**
   * Durée moyenne du travail sur cette étape, en minutes.
   *
   * `null` et non zéro : « je ne sais pas » et « ça ne prend pas de temps » sont deux
   * réponses différentes, et seule la première doit faire chercher ailleurs. C'est ce
   * chiffre que le planning utilise pour savoir quelle place réserver.
   */
  defaultMinutes: number | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductionStepInput {
  name: string;
  color?: string;
  sortOrder?: number;
  defaultMinutes?: number | null;
}

export type UpdateProductionStepInput = Partial<CreateProductionStepInput> & {
  isArchived?: boolean;
};

/** Identifiant fixe de l'étape de publication, cochée automatiquement à la sortie. */
export const PUBLISH_STEP_ID = 'publication';
