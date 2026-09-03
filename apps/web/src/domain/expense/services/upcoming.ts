import type { ExpenseEntry } from '../entities/Expense.ts';

/**
 * Ce qui est déjà engagé mais pas encore passé : échéances fiscales, abonnements,
 * factures datées en avant.
 *
 * Ces lignes existent en base au même titre que les autres — rien ne distingue une
 * dépense future d'une dépense passée sinon sa date. Elles sont pourtant **hors des
 * cumuls du dashboard**, qui s'arrêtent à la fin de la période affichée : c'est
 * exactement pour ça qu'il faut les rappeler quelque part, sinon un trimestre d'URSSAF
 * arrive sans prévenir sur un bénéfice qu'on croyait acquis.
 */

/**
 * Fenêtre de projection, en mois. Trois mois couvrent un trimestre fiscal complet ;
 * au-delà, l'information cesse d'être actionnable et devient du bruit.
 */
export const UPCOMING_MONTHS = 3;

/**
 * Identifiant de la catégorie fiscale, fixé par le seed (`SeedDefaultCategories`) et
 * repris par la migration 2. C'est lui qui alimente le « dont X d'impôts » : le déduire
 * du libellé casserait au premier renommage.
 */
export const TAX_CATEGORY_ID = 'impots';

export interface UpcomingSummary {
  totalCents: number;
  /** Part fiscale du total, pour la ligne « dont X d'impôts ». */
  taxCents: number;
  count: number;
  /** Détail par catégorie, du plus lourd au plus léger — le panneau déplié s'en sert. */
  byCategory: Array<{ categoryId: string; name: string; color: string; totalCents: number }>;
  /** La première échéance à venir : celle qui tombe le plus tôt. */
  nextDate: string | null;
}

export const summarizeUpcoming = (expenses: ExpenseEntry[]): UpcomingSummary => {
  const byCategory = new Map<string, { name: string; color: string; totalCents: number }>();
  let totalCents = 0;
  let taxCents = 0;
  let nextDate: string | null = null;

  for (const expense of expenses) {
    totalCents += expense.amountCents;
    if (expense.categoryId === TAX_CATEGORY_ID) taxCents += expense.amountCents;
    if (nextDate === null || expense.date < nextDate) nextDate = expense.date;

    const bucket = byCategory.get(expense.categoryId) ?? {
      name: expense.categoryName,
      color: expense.categoryColor,
      totalCents: 0,
    };
    bucket.totalCents += expense.amountCents;
    byCategory.set(expense.categoryId, bucket);
  }

  return {
    totalCents,
    taxCents,
    count: expenses.length,
    byCategory: [...byCategory.entries()]
      .map(([categoryId, bucket]) => ({ categoryId, ...bucket }))
      .sort((a, b) => b.totalCents - a.totalCents),
    nextDate,
  };
};
