import type { Product } from '../../product/entities/Product.ts';
import { PENDING_PRODUCT_STATUSES } from '../../product/entities/Product.ts';
import type { Sponsorship } from '../../sponsorship/entities/Sponsorship.ts';
import { PENDING_SPONSORSHIP_STATUSES } from '../../sponsorship/entities/Sponsorship.ts';

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
 * Volontairement **hors période** : une sponso signée en mars et pas encore payée est
 * toujours à encaisser en juin. Ce sont des états, pas des flux — les borner par la
 * période du dashboard les ferait disparaître le mois suivant.
 *
 * Le calcul vit ici et non dans les écrans : le dashboard et l'onglet Partenariats
 * affichent les mêmes chiffres, et deux comptages parallèles finiraient par diverger.
 */
export const partnerPipeline = (
  products: Product[],
  sponsorships: Sponsorship[],
  today: string,
): PartnerPipeline => {
  const pendingProducts = products.filter((product) =>
    PENDING_PRODUCT_STATUSES.includes(product.status),
  );
  const receivedProducts = products.filter((product) => product.status === 'received');
  const pendingSponsorships = sponsorships.filter((sponsorship) =>
    PENDING_SPONSORSHIP_STATUSES.includes(sponsorship.status),
  );
  const paidSponsorships = sponsorships.filter((sponsorship) => sponsorship.status === 'paid');

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
