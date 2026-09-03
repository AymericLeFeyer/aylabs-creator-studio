/** Contrat de `/api/recurring-expenses`. */

export type RecurrenceFrequency = 'monthly' | 'yearly';

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  monthly: 'Mensuelle',
  yearly: 'Annuelle',
};

/**
 * Une dépense qui revient : abonnement, hébergement, assurance.
 *
 * Ce n'est pas une ligne de dépense mais une **règle qui en engendre**. Les occurrences
 * sont de vraies dépenses (`recurringId` renseigné) : elles comptent dans les cumuls et
 * les graphiques comme n'importe quelle saisie manuelle, et l'API garde toujours douze
 * échéances d'avance.
 */
export interface RecurringExpense {
  id: string;
  channelId: string | null;
  channelName: string | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  label: string;
  amountCents: number;
  frequency: RecurrenceFrequency;
  dayOfMonth: number;
  monthOfYear: number | null;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  isActive: boolean;
  /** Prochaine occurrence à venir, `null` si la règle est arrêtée ou terminée. */
  nextDate: string | null;
  occurrencesCount: number;
  /** Coût sur douze mois : le seul chiffre comparable entre mensuel et annuel. */
  yearlyCents: number;
  createdAt: string;
  updatedAt: string;
}

/** `amount` est en euros : l'API le convertit en centimes. */
export interface RecurringExpenseInput {
  channelId?: string | null;
  categoryId: string;
  label: string;
  amount: number;
  frequency: RecurrenceFrequency;
  dayOfMonth?: number;
  monthOfYear?: number | null;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
  isActive?: boolean;
}
