import type { IsoDate } from '../../../shared/dates.ts';
import type { Cents } from '../../../shared/money.ts';

/**
 * Cycle de vie d'une sponso.
 *
 * `discussion` → on négocie ; `todo` → c'est signé, rien n'est produit ; `in_progress`
 * → l'intégration est en cours ; `paid` → l'argent est arrivé. `cancelled` complète les
 * quatre demandés : sans lui, une négo qui n'aboutit pas reste dans le pipeline à vie
 * et fausse le montant « à encaisser ».
 */
export type SponsorshipStatus = 'discussion' | 'todo' | 'in_progress' | 'paid' | 'cancelled';

export const SPONSORSHIP_STATUSES: SponsorshipStatus[] = [
  'discussion',
  'todo',
  'in_progress',
  'paid',
  'cancelled',
];

/** Statuts où l'argent est attendu mais pas encaissé : ce que totalise « en cours ». */
export const PENDING_SPONSORSHIP_STATUSES: SponsorshipStatus[] = [
  'discussion',
  'todo',
  'in_progress',
];

/**
 * Un partenariat rémunéré.
 *
 * Passé à `paid`, il génère une entrée de revenu **cash** (catégorie « Sponsors »)
 * rattachée à la vidéo de sa production. L'entrée reste liée par `revenueEntryId` :
 * même règle que pour les produits, une seule saisie.
 */
export interface Sponsorship {
  id: string;
  brandId: string | null;
  productionId: string | null;
  channelId: string | null;
  /** Revenu cash généré. `null` tant que ce n'est pas payé. */
  revenueEntryId: string | null;
  label: string;
  amountCents: Cents;
  status: SponsorshipStatus;
  /** Échéance de livraison : la date à laquelle la vidéo doit être en ligne. */
  deadline: IsoDate | null;
  paidAt: IsoDate | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SponsorshipView extends Sponsorship {
  brandName: string | null;
  brandColor: string | null;
  productionTitle: string | null;
  channelName: string | null;
  /** Produits venus avec cette sponso, et leur valeur cumulée en nature. */
  productsCount: number;
  productsValueCents: Cents;
}

export interface CreateSponsorshipInput {
  label: string;
  brandId?: string | null;
  productionId?: string | null;
  channelId?: string | null;
  amountCents?: Cents;
  status?: SponsorshipStatus;
  deadline?: IsoDate | null;
  paidAt?: IsoDate | null;
  notes?: string | null;
}

export type UpdateSponsorshipInput = Partial<CreateSponsorshipInput>;
