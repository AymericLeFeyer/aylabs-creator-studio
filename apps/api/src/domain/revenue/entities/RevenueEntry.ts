import type { Cents } from '../../../shared/money.ts';
import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Un revenu saisi manuellement (sponso, affiliation, produit reçu...).
 * Les revenus AdSense ne passent PAS par ici : ils viennent de `daily_metrics`.
 */
export interface RevenueEntry {
  id: string;
  /** `null` = revenu non rattaché à une chaîne (compte dans le cumulé uniquement). */
  channelId: string | null;
  categoryId: string;
  date: IsoDate;
  amountCents: Cents;
  label: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRevenueEntryInput {
  channelId?: string | null;
  categoryId: string;
  date: IsoDate;
  amountCents: Cents;
  label: string;
  notes?: string | null;
}

export type UpdateRevenueEntryInput = Partial<CreateRevenueEntryInput>;

/** Entrée enrichie de sa catégorie, pour l'affichage en liste. */
export interface RevenueEntryView extends RevenueEntry {
  categoryName: string;
  categoryNature: 'cash' | 'in_kind';
  categoryColor: string;
  channelName: string | null;
}
