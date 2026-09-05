/** Contrat de `/api/products`. */

import type { ProductionStatus } from '../../production/entities/Production.ts';

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

export const PRODUCT_STATUS_LABELS: Record<ProductStatus, string> = {
  discussion: 'En discussion',
  confirmed: 'Confirmé',
  shipped: 'Expédié',
  received: 'Reçu',
  returned: 'Renvoyé',
  cancelled: 'Annulé',
};

export const PRODUCT_STATUS_HINTS: Record<ProductStatus, string> = {
  discussion: "La marque et toi en parlez encore. Rien n'est promis.",
  confirmed: 'Accord donné, le produit va partir.',
  shipped: 'En route.',
  received: 'Arrivé — c’est ce statut qui crée le revenu en nature.',
  returned: 'Rendu à la marque : plus rien ne compte dans les gains.',
  cancelled: 'La discussion n’a pas abouti.',
};

/** Statuts où le produit est attendu : ceux dont la deadline sert à quelque chose. */
export const PENDING_PRODUCT_STATUSES: ProductStatus[] = ['discussion', 'confirmed', 'shipped'];

/**
 * Le rang de tri dans la liste, **avant** toute date. Dupliqué à l'identique côté API,
 * où il vit dans le `ORDER BY` du dépôt (voir `PRODUCT_SORT_RANK`).
 *
 * L'ordre suit l'urgence, et elle est l'inverse de l'ordre chronologique du pipeline :
 * un colis **expédié** arrive demain sans que sa vidéo soit prête, un **confirmé** part
 * bientôt, une **discussion** n'engage à rien, un **reçu** n'attend plus que d'être
 * filmé. Renvoyé et annulé ferment la liste : ils ne demandent plus rien.
 */
export const PRODUCT_SORT_RANK: Record<ProductStatus, number> = {
  shipped: 0,
  confirmed: 1,
  discussion: 2,
  received: 3,
  returned: 4,
  cancelled: 5,
};

export interface Product {
  id: string;
  brandId: string | null;
  productionId: string | null;
  /**
   * Sortie **déjà publiée** concernée, quand elle n'a pas de fiche de production dans
   * l'outil — tout l'historique collecté sur YouTube est dans ce cas. Exclusif de
   * `productionId` à l'usage : le formulaire n'en pose qu'un.
   */
  videoId: string | null;
  /**
   * Sponso dont ce produit fait partie. `null` quand il arrive seul — le cas le plus
   * courant, et l'inverse (une sponso sans colis) l'est tout autant. Le lien est
   * informatif : les deux montants restent distincts, rien n'est compté deux fois.
   */
  sponsorshipId: string | null;
  channelId: string | null;
  /** Revenu en nature généré. `null` tant que le produit n'est pas reçu. */
  revenueEntryId: string | null;
  name: string;
  url: string | null;
  valueCents: number;
  status: ProductStatus;
  requestedAt: string | null;
  deadline: string | null;
  receivedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;

  brandName: string | null;
  brandColor: string | null;
  productionTitle: string | null;
  /**
   * Où en est la vidéo à laquelle le produit est destiné. `null` quand aucune fiche de
   * production n'est rattachée : le produit vise alors une sortie déjà publiée
   * (`videoTitle`), ou rien du tout — et c'est ce « rien du tout » qu'on cherche des
   * yeux devant un carton reçu.
   */
  productionStatus: ProductionStatus | null;
  videoTitle: string | null;
  channelName: string | null;
  sponsorshipLabel: string | null;
}

/** `value` est en euros : l'API le convertit en centimes. */
export interface ProductInput {
  name: string;
  brandId?: string | null;
  productionId?: string | null;
  videoId?: string | null;
  sponsorshipId?: string | null;
  channelId?: string | null;
  url?: string | null;
  value?: number;
  status?: ProductStatus;
  requestedAt?: string | null;
  deadline?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
}
