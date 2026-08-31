import type { Cents } from '../../../shared/money.ts';
import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Une dépense saisie manuellement : impôts, URSSAF, TVA, mais aussi matériel,
 * abonnements, prestations. Toujours un montant positif — c'est le calcul du
 * bénéfice qui la soustrait.
 */
export interface ExpenseEntry {
  id: string;
  /** `null` = dépense globale, non imputable à une chaîne précise. */
  channelId: string | null;
  categoryId: string;
  /** Vidéo à laquelle cette dépense est rattachée. `null` = dépense non imputée. */
  videoId: string | null;
  date: IsoDate;
  amountCents: Cents;
  label: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateExpenseEntryInput {
  channelId?: string | null;
  categoryId: string;
  videoId?: string | null;
  date: IsoDate;
  amountCents: Cents;
  label: string;
  notes?: string | null;
}

export type UpdateExpenseEntryInput = Partial<CreateExpenseEntryInput>;

export interface ExpenseEntryView extends ExpenseEntry {
  categoryName: string;
  categoryColor: string;
  channelName: string | null;
  videoTitle: string | null;
}
