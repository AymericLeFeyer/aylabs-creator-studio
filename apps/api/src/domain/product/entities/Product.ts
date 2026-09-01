import type { IsoDate } from '../../../shared/dates.ts';
import type { Cents } from '../../../shared/money.ts';

/**
 * Cycle de vie d'un produit envoyé par une marque.
 *
 * `received` est le seul statut qui compte en argent : c'est lui qui déclenche le
 * revenu en nature. `returned` et `cancelled` existent pour que le pipeline se vide —
 * une négo morte laissée en « en discussion » pollue la vue pour toujours.
 */
export type ProductStatus =
  'discussion' | 'confirmed' | 'shipped' | 'received' | 'returned' | 'cancelled';

export const PRODUCT_STATUSES: ProductStatus[] = [
  'discussion',
  'confirmed',
  'shipped',
  'received',
  'returned',
  'cancelled',
];

/** Statuts où le produit est attendu mais pas encore arrivé : ceux qui ont une deadline utile. */
export const PENDING_PRODUCT_STATUSES: ProductStatus[] = ['discussion', 'confirmed', 'shipped'];

/**
 * Un produit reçu (ou attendu) d'une marque, valorisé en euros.
 *
 * Passé à `received`, il génère une entrée de revenu **en nature** rattachée à la même
 * chaîne et à la même vidéo que sa production. Cette entrée reste liée par
 * `revenueEntryId` : la modifier ici la met à jour là-bas, et l'écran Revenus la
 * refuse à l'édition manuelle pour que les deux côtés ne divergent jamais.
 */
export interface Product {
  id: string;
  brandId: string | null;
  /** Vidéo en préparation à laquelle le produit est destiné. */
  productionId: string | null;
  channelId: string | null;
  /** Revenu en nature généré. `null` tant que le produit n'est pas reçu. */
  revenueEntryId: string | null;
  name: string;
  url: string | null;
  valueCents: Cents;
  status: ProductStatus;
  /** Quand tu l'as demandé / la marque l'a proposé. */
  requestedAt: IsoDate | null;
  /** Échéance : date à laquelle il doit être arrivé, ou la vidéo tournée. */
  deadline: IsoDate | null;
  receivedAt: IsoDate | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductView extends Product {
  brandName: string | null;
  brandColor: string | null;
  productionTitle: string | null;
  channelName: string | null;
}

export interface CreateProductInput {
  name: string;
  brandId?: string | null;
  productionId?: string | null;
  channelId?: string | null;
  url?: string | null;
  valueCents?: Cents;
  status?: ProductStatus;
  requestedAt?: IsoDate | null;
  deadline?: IsoDate | null;
  receivedAt?: IsoDate | null;
  notes?: string | null;
}

export type UpdateProductInput = Partial<CreateProductInput>;
