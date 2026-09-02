/**
 * Une case à cocher qui revient chaque mois : déclaration Urssaf, DES, facturation
 * manuelle de l'affiliation…
 *
 * C'est une **ligne** et non une colonne, même raison que les étapes de production :
 * en ajouter une ne demande aucune migration, et le référentiel se gère depuis les
 * paramètres.
 */
export interface LegalObligation {
  id: string;
  label: string;
  /**
   * Jour limite dans le mois (1–31). `null` quand aucune échéance n'est connue : c'est
   * alors le mois entier qui fait foi, et rien n'est en retard tant qu'il n'est pas
   * terminé. Un 31 sur un mois de 30 jours est ramené au dernier jour du mois.
   */
  dayOfMonth: number | null;
  notes: string | null;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLegalObligationInput {
  label: string;
  dayOfMonth?: number | null;
  notes?: string | null;
  sortOrder?: number;
}

export interface UpdateLegalObligationInput extends Partial<CreateLegalObligationInput> {
  isArchived?: boolean;
}

/** Une case cochée : la présence de la ligne vaut « fait ». */
export interface LegalCheck {
  obligationId: string;
  /** Mois visé, au format `AAAA-MM`. */
  month: string;
  checkedAt: string;
}
