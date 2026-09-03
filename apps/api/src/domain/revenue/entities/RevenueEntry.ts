import type { Cents } from '../../../shared/money.ts';
import type { IsoDate } from '../../../shared/dates.ts';

/**
 * D'où vient un revenu.
 *
 * `product` et `sponsorship` désignent une entrée **générée** par le module de
 * production, qui reste liée à sa fiche. Elle n'est plus modifiable depuis l'écran
 * Revenus : deux points d'écriture sur la même ligne les feraient diverger en silence
 * — le montant corrigé ici ne remonterait jamais dans la fiche produit.
 */
export type RevenueOrigin = 'manual' | 'product' | 'sponsorship';

/**
 * Un revenu saisi manuellement (sponso, affiliation, produit reçu...).
 * Les revenus AdSense ne passent PAS par ici : ils viennent de `daily_metrics`.
 */
export interface RevenueEntry {
  id: string;
  /** `null` = revenu non rattaché à une chaîne (compte dans le cumulé uniquement). */
  channelId: string | null;
  categoryId: string;
  /** Vidéo à laquelle ce revenu est rattaché. `null` = revenu non imputé à une sortie. */
  videoId: string | null;
  /**
   * Plateforme d'affiliation qui a rapporté ce revenu. `null` = non rattaché — tous les
   * revenus ne viennent pas de l'affiliation. C'est ce champ qui permet de dire quelle
   * plateforme rapporte le plus.
   */
  platformId: string | null;
  date: IsoDate;
  amountCents: Cents;
  label: string;
  notes: string | null;
  origin: RevenueOrigin;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRevenueEntryInput {
  channelId?: string | null;
  categoryId: string;
  videoId?: string | null;
  platformId?: string | null;
  date: IsoDate;
  amountCents: Cents;
  label: string;
  notes?: string | null;
  /** Défaut `manual` : seuls les use cases de production posent autre chose. */
  origin?: RevenueOrigin;
}

export type UpdateRevenueEntryInput = Partial<CreateRevenueEntryInput>;

/** Entrée enrichie de sa catégorie, pour l'affichage en liste. */
export interface RevenueEntryView extends RevenueEntry {
  categoryName: string;
  categoryNature: 'cash' | 'in_kind';
  categoryColor: string;
  channelName: string | null;
  videoTitle: string | null;
  /** Nom de la plateforme rattachée, pour l'afficher sans seconde requête. */
  platformName: string | null;
}
