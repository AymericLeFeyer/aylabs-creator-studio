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
  date: string;
  amountCents: number;
  label: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `amount` est en euros : l'API le convertit en centimes. */
export interface ExpenseEntryInput {
  channelId?: string | null;
  categoryId: string;
  date: string;
  amount: number;
  label: string;
  notes?: string | null;
}
