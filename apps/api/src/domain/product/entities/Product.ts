import type { IsoDate } from '../../../shared/dates.ts';
import type { Cents } from '../../../shared/money.ts';
import type { ProductionStatus } from '../../production/entities/Production.ts';

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
 * Le rang de tri d'un produit dans la liste, **avant** toute date.
 *
 * L'ordre suit l'urgence réelle, et elle est l'inverse de l'ordre chronologique du
 * pipeline : un colis **expédié** arrive demain et sa vidéo n'est pas prête ; un produit
 * **confirmé** part bientôt ; une **discussion** n'engage à rien ; un produit **reçu**
 * n'attend plus que d'être filmé, ce que la colonne « Vidéo » dit ligne par ligne.
 * Renvoyé et annulé ferment la liste : ils ne demandent plus rien.
 *
 * La table se lisait auparavant comme un journal de réceptions — utile pour retrouver
 * quand un colis est arrivé, inutile pour savoir quoi faire aujourd'hui.
 *
 * Dupliqué à l'identique côté front, comme `SPONSORSHIP_SORT_RANK` : le tri vit dans le
 * `ORDER BY` du dépôt, cette table le rend lisible.
 */
export const PRODUCT_SORT_RANK: Record<ProductStatus, number> = {
  shipped: 0,
  confirmed: 1,
  discussion: 2,
  received: 3,
  // Le cran 4 est laissé libre : un produit reçu qui a déjà sa vidéo prend `received + 1`.
  returned: 5,
  cancelled: 6,
};

/**
 * Le rang effectif d'un produit : son statut, **plus un cran s'il est reçu et déjà
 * rattaché à une vidéo**.
 *
 * Un colis reçu sans vidéo est du travail qui attend ; le même colis, une fois la vidéo
 * faite, ne demande plus rien. Les mélanger dans un seul bloc « Reçu » obligeait à lire la
 * colonne « Vidéo » ligne par ligne pour retrouver ce qui restait à tourner — or c'est
 * exactement la question que cette table doit répondre d'un coup d'œil.
 *
 * « Avoir une vidéo » se lit ici comme partout ailleurs dans le module :
 * `videoId ?? productionId`, une sortie déjà publiée valant autant qu'une fiche de
 * production.
 */
export const productSortRank = (
  product: Pick<Product, 'status' | 'productionId' | 'videoId'>,
): number =>
  PRODUCT_SORT_RANK[product.status] +
  (product.status === 'received' && (product.videoId !== null || product.productionId !== null)
    ? 1
    : 0);

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
  /**
   * Sortie **déjà publiée** concernée, quand elle n'a pas de fiche de production dans
   * l'outil — tout l'historique collecté sur YouTube est dans ce cas. Exclusif de
   * `productionId` à l'usage : le formulaire n'en pose qu'un.
   */
  videoId: string | null;
  /**
   * Sponso dont ce produit fait partie. `null` quand le produit arrive seul — c'est
   * le cas le plus courant, et l'inverse (une sponso sans colis) l'est tout autant.
   * Le lien est purement informatif : les deux montants restent distincts, le produit
   * vaut en nature ce que la sponso vaut en cash, et rien n'est compté deux fois.
   */
  sponsorshipId: string | null;
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
  /**
   * Où en est la vidéo à laquelle le produit est destiné.
   *
   * C'est la question qu'on se pose devant un carton reçu : « lequel de ces produits
   * n'a pas encore de vidéo ? ». Le titre seul ne le disait pas — une fiche « idée »
   * et une vidéo publiée s'y lisaient pareil. `null` quand aucune production n'est
   * rattachée : le produit vise alors une sortie déjà publiée (`videoTitle`), ou rien
   * du tout — et c'est ce « rien du tout » qui est le signal.
   */
  productionStatus: ProductionStatus | null;
  videoTitle: string | null;
  channelName: string | null;
  sponsorshipLabel: string | null;
}

export interface CreateProductInput {
  name: string;
  brandId?: string | null;
  productionId?: string | null;
  videoId?: string | null;
  sponsorshipId?: string | null;
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
