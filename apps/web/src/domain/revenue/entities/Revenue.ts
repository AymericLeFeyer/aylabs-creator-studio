/** Contrat de `/api/revenues`. Les catégories vivent dans `domain/category`. */

import type { CategoryNature } from '../../category/entities/Category.ts';

/**
 * D'où vient un revenu. `product` et `sponsorship` désignent une entrée **générée** par
 * le module de production : elle reste liée à sa fiche et l'API refuse en 409 toute
 * modification depuis cet écran — deux points d'écriture les feraient diverger.
 */
export type RevenueOrigin = 'manual' | 'product' | 'sponsorship';

/** Écran qui fait autorité sur une entrée générée, et où la corriger. */
export const ORIGIN_LABELS: Record<Exclude<RevenueOrigin, 'manual'>, string> = {
  product: 'Produit reçu',
  sponsorship: 'Sponso',
};

export const ORIGIN_TARGET: Record<Exclude<RevenueOrigin, 'manual'>, string> = {
  product: '/partenariats?onglet=produits',
  sponsorship: '/partenariats?onglet=sponsors',
};

export interface RevenueEntry {
  id: string;
  channelId: string | null;
  categoryId: string;
  /** Vidéo rattachée, `null` si le revenu n'est imputé à aucune sortie. */
  videoId: string | null;
  date: string;
  amountCents: number;
  label: string;
  notes: string | null;
  origin: RevenueOrigin;
  categoryName: string;
  categoryNature: CategoryNature;
  categoryColor: string;
  channelName: string | null;
  videoTitle: string | null;
  createdAt: string;
  updatedAt: string;
}

/** `amount` est en euros : l'API le convertit en centimes. */
export interface RevenueEntryInput {
  channelId?: string | null;
  categoryId: string;
  videoId?: string | null;
  date: string;
  amount: number;
  label: string;
  notes?: string | null;
}
