import type { Product } from '../../product/entities/Product.ts';
import { PENDING_PRODUCT_STATUSES } from '../../product/entities/Product.ts';
import type { Sponsorship } from '../../sponsorship/entities/Sponsorship.ts';
import { PENDING_SPONSORSHIP_STATUSES } from '../../sponsorship/entities/Sponsorship.ts';

/** Bornes de la période affichée. Absente = « tout », comme sur le dashboard. */
export interface PartnerRange {
  from: string;
  to: string;
}

/**
 * Une ligne de partenariat appartient-elle à la période affichée ?
 *
 * **Une seule règle, et elle vaut pour les produits comme pour les sponsos : ce qui est
 * clos appartient à la période de sa date de clôture ; ce qui est encore en cours
 * n'appartient à aucune et reste visible partout.**
 *
 * C'est ce qui permet de borner l'écran sans faire disparaître le pipeline : un colis
 * attendu depuis mars est toujours attendu en juin, et une sponso signée et non payée est
 * toujours à encaisser — les masquer parce qu'on regarde août ferait perdre de vue
 * précisément ce sur quoi il reste à agir. Un produit **reçu** en mars, lui, n'a rien à
 * faire dans le mois d'août.
 *
 * Même convention de dates que `brandStats` côté API : `received_at` pour un produit,
 * `paid_at` pour une sponso. Une ligne close **sans date** reste visible partout : elle ne
 * peut être rangée dans aucune période, et la faire disparaître de toutes serait la perdre
 * de vue — c'est un trou de saisie, pas une ligne à masquer.
 */
export const inPartnerPeriod = (
  closedAt: string | null,
  closed: boolean,
  range?: PartnerRange | null,
): boolean => {
  if (!range || !closed || closedAt === null) return true;
  return closedAt >= range.from && closedAt <= range.to;
};

/** Un produit **reçu** est daté par sa réception ; tout le reste est un état. */
export const productInPeriod = (product: Product, range?: PartnerRange | null): boolean =>
  inPartnerPeriod(product.receivedAt, product.status === 'received', range);

/** Une sponso **payée** est datée par son encaissement ; tout le reste est un état. */
export const sponsorshipInPeriod = (
  sponsorship: Sponsorship,
  range?: PartnerRange | null,
): boolean => inPartnerPeriod(sponsorship.paidAt, sponsorship.status === 'paid', range);

export interface PartnerPipeline {
  productsPending: number;
  /** Attendus dont l'échéance est dépassée : ce sont eux qui bloquent une vidéo. */
  productsLate: number;
  productsReceived: number;
  productsReceivedCents: number;
  sponsorshipsPending: number;
  sponsorshipsPendingCents: number;
  sponsorshipsPaid: number;
  sponsorshipsPaidCents: number;
}

/**
 * L'état du pipeline de partenariats.
 *
 * **Les deux moitiés ne se lisent pas dans le même temps, et c'est tout l'intérêt.**
 *
 * Ce qui est **en cours** — produits attendus, sponsos à encaisser — est volontairement
 * hors période : une sponso signée en mars et pas encore payée est toujours à encaisser en
 * juin. Ce sont des états, et les borner les ferait disparaître le mois suivant.
 *
 * Ce qui est **clos** — produits reçus, sponsos encaissées — suit `range` quand on lui en
 * donne un : ce sont des flux, exactement comme le chiffre d'affaires, et « valeur reçue »
 * ne veut rien dire sans dire *quand*. Sans `range` (le dashboard, qui tire déjà ses flux
 * d'`analytics`), le comportement est celui d'avant : tout, depuis toujours.
 *
 * Le calcul vit ici et non dans les écrans : le dashboard et l'onglet Partenariats
 * affichent les mêmes chiffres, et deux comptages parallèles finiraient par diverger. Les
 * tables de `/partenariats` filtrent avec **les mêmes** prédicats (`productInPeriod`,
 * `sponsorshipInPeriod`), si bien que le total annoncé retombe toujours sur les lignes
 * affichées en dessous.
 */
export const partnerPipeline = (
  products: Product[],
  sponsorships: Sponsorship[],
  today: string,
  range?: PartnerRange | null,
): PartnerPipeline => {
  const pendingProducts = products.filter((product) =>
    PENDING_PRODUCT_STATUSES.includes(product.status),
  );
  const receivedProducts = products.filter(
    (product) => product.status === 'received' && productInPeriod(product, range),
  );
  const pendingSponsorships = sponsorships.filter((sponsorship) =>
    PENDING_SPONSORSHIP_STATUSES.includes(sponsorship.status),
  );
  const paidSponsorships = sponsorships.filter(
    (sponsorship) => sponsorship.status === 'paid' && sponsorshipInPeriod(sponsorship, range),
  );

  return {
    productsPending: pendingProducts.length,
    productsLate: pendingProducts.filter(
      (product) => product.deadline !== null && product.deadline < today,
    ).length,
    productsReceived: receivedProducts.length,
    productsReceivedCents: receivedProducts.reduce(
      (total, product) => total + product.valueCents,
      0,
    ),
    sponsorshipsPending: pendingSponsorships.length,
    sponsorshipsPendingCents: pendingSponsorships.reduce(
      (total, sponsorship) => total + sponsorship.amountCents,
      0,
    ),
    sponsorshipsPaid: paidSponsorships.length,
    sponsorshipsPaidCents: paidSponsorships.reduce(
      (total, sponsorship) => total + sponsorship.amountCents,
      0,
    ),
  };
};
