/** Contrat de `/api/products`. */

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

export interface Product {
  id: string;
  brandId: string | null;
  productionId: string | null;
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
  channelName: string | null;
}

/** `value` est en euros : l'API le convertit en centimes. */
export interface ProductInput {
  name: string;
  brandId?: string | null;
  productionId?: string | null;
  channelId?: string | null;
  url?: string | null;
  value?: number;
  status?: ProductStatus;
  requestedAt?: string | null;
  deadline?: string | null;
  receivedAt?: string | null;
  notes?: string | null;
}
