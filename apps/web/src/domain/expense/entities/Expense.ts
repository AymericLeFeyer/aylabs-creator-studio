/**
 * Contrat de `/api/expenses`. Les dépenses sont toujours positives et se soustraient
 * du CA pour donner le bénéfice.
 */

export interface ExpenseEntry {
  id: string;
  channelId: string | null;
  channelName: string | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  /** Vidéo rattachée, `null` si la dépense n'est imputée à aucune sortie. */
  videoId: string | null;
  videoTitle: string | null;
  date: string;
  amountCents: number;
  label: string;
  notes: string | null;
  /**
   * Règle récurrente qui a engendré cette ligne. `null` = saisie à la main.
   * Sert à la signaler dans le tableau : une occurrence ne se corrige pas ligne à ligne,
   * elle se corrige sur sa règle.
   */
  recurringId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `amount` est en euros : l'API le convertit en centimes. */
export interface ExpenseEntryInput {
  channelId?: string | null;
  categoryId: string;
  videoId?: string | null;
  date: string;
  amount: number;
  label: string;
  notes?: string | null;
}
