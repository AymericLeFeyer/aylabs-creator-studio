/** Contrat de `/api/revenues`. Les catégories vivent dans `domain/category`. */

import type { CategoryNature } from '../../category/entities/Category.ts';

export interface RevenueEntry {
  id: string;
  channelId: string | null;
  categoryId: string;
  date: string;
  amountCents: number;
  label: string;
  notes: string | null;
  categoryName: string;
  categoryNature: CategoryNature;
  categoryColor: string;
  channelName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `amount` est en euros : l'API le convertit en centimes. */
export interface RevenueEntryInput {
  channelId?: string | null;
  categoryId: string;
  date: string;
  amount: number;
  label: string;
  notes?: string | null;
}
