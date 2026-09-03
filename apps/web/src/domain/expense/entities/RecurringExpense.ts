/** Contrat de `/api/recurring-expenses`. */

/**
 * Périodicité **en mois** : 1 mensuel, 3 trimestriel, 12 annuel, 24 tous les deux ans.
 *
 * Un nombre plutôt qu'une énumération : ajouter « tous les deux ans » à une liste fermée
 * demandait une migration, et la suivante en aurait demandé une autre. Toute périodicité
 * exprimable en mois existe désormais sans rien toucher.
 */
export const INTERVAL_PRESETS = [
  { months: 1, label: 'Mensuelle' },
  { months: 3, label: 'Trimestrielle' },
  { months: 6, label: 'Semestrielle' },
  { months: 12, label: 'Annuelle' },
  { months: 24, label: 'Tous les 2 ans' },
] as const;

/** « Tous les 2 ans », ou « Tous les 18 mois » pour un rythme sans préréglage. */
export const intervalLabel = (months: number): string => {
  const preset = INTERVAL_PRESETS.find((item) => item.months === months);
  if (preset) return preset.label;
  return months % 12 === 0 ? `Tous les ${months / 12} ans` : `Tous les ${months} mois`;
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
  intervalMonths: number;
  dayOfMonth: number;
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
  intervalMonths: number;
  dayOfMonth?: number;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
  isActive?: boolean;
}
