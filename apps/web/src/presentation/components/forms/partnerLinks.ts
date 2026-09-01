/**
 * Les deux moitiés d'un partenariat, côté écriture.
 *
 * Un produit et une sponso vont souvent ensemble — mais pas toujours : beaucoup de
 * produits arrivent sans contrepartie, beaucoup de sponsos sans colis. Le lien est donc
 * facultatif des deux côtés, et **N:1** : une marque envoie parfois trois objets pour
 * une seule intégration, un objet n'appartient qu'à un partenariat.
 *
 * Les montants restent distincts de part et d'autre : le produit vaut en nature ce que
 * la sponso vaut en cash, rien n'est compté deux fois.
 *
 * Ce fichier n'exporte aucun composant (règle `react-refresh/only-export-components`) :
 * les champs vivent dans `SponsorshipLinkField.tsx` et `ProductLinkField.tsx`.
 */
import {
  useCreateProduct,
  useUpdateProduct,
} from '../../../application/product/usecases/useProducts.ts';
import { useCreateSponsorship } from '../../../application/sponsorship/usecases/useSponsorships.ts';
import type { ProductStatus } from '../../../domain/product/entities/Product.ts';
import type { SponsorshipStatus } from '../../../domain/sponsorship/entities/Sponsorship.ts';
import { toIsoDate } from '../../../shared/format.ts';
import { NONE } from './selectNone.ts';

/** Contexte partagé : ce que la moitié créée sur place hérite du formulaire en cours. */
export interface PartnerContext {
  brandId: string | null;
  productionId: string | null;
  channelId: string | null;
}

// --- Produit → sponso (N:1) -------------------------------------------------

/** Valeur du `Select` qui déplie les champs de création d'une sponso. */
export const NEW_SPONSORSHIP = '__new__';

export interface SponsorshipDraft {
  label: string;
  amount: string;
  status: SponsorshipStatus;
}

export const EMPTY_SPONSORSHIP_DRAFT: SponsorshipDraft = {
  label: '',
  amount: '',
  status: 'discussion',
};

/**
 * Résout le champ en un identifiant de sponso, en la créant au passage si besoin.
 *
 * La création est faite **avant** l'enregistrement du produit : sans identifiant, le
 * produit n'aurait rien à référencer.
 */
export const useResolveSponsorshipLink = () => {
  const create = useCreateSponsorship();

  const resolve = async (
    value: string,
    draft: SponsorshipDraft,
    context: PartnerContext,
  ): Promise<string | null> => {
    if (value === NONE) return null;
    if (value !== NEW_SPONSORSHIP) return value;

    const label = draft.label.trim();
    if (!label) throw new Error('Donne un libellé à la sponso à créer.');

    const amount = draft.amount ? Number(draft.amount.replace(',', '.')) : 0;
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Le montant de la sponso doit être positif.');
    }

    const created = await create.mutateAsync({
      label,
      amount,
      status: draft.status,
      brandId: context.brandId,
      productionId: context.productionId,
      channelId: context.channelId,
      // Payée sans date : le revenu a besoin d'un jour pour tomber dans une période.
      paidAt: draft.status === 'paid' ? toIsoDate(new Date()) : null,
    });
    return created.id;
  };

  return { resolve, isPending: create.isPending };
};

// --- Sponso → produits (1:N) ------------------------------------------------

export interface ProductDraft {
  name: string;
  value: string;
  status: ProductStatus;
}

export const EMPTY_PRODUCT_DRAFT: ProductDraft = { name: '', value: '', status: 'discussion' };

/**
 * Ce que le formulaire de sponso retient sur ses produits tant qu'il n'est pas
 * enregistré : une sponso en cours de création n'a pas encore d'identifiant à donner.
 */
export interface ProductLinkState {
  /** Produits existants à rattacher. */
  attachIds: string[];
  /** Produits déjà rattachés à détacher. */
  detachIds: string[];
  /** Produit à créer sur place, ou `null`. */
  draft: ProductDraft | null;
}

export const EMPTY_PRODUCT_LINKS: ProductLinkState = {
  attachIds: [],
  detachIds: [],
  draft: null,
};

/**
 * Applique les rattachements une fois la sponso enregistrée — après, et jamais avant :
 * en création, l'identifiant n'existe pas encore.
 */
export const useApplyProductLinks = () => {
  const create = useCreateProduct();
  const update = useUpdateProduct();

  const apply = async (
    sponsorshipId: string,
    state: ProductLinkState,
    context: PartnerContext,
  ): Promise<void> => {
    for (const id of state.attachIds) {
      await update.mutateAsync({ id, input: { sponsorshipId } });
    }
    for (const id of state.detachIds) {
      await update.mutateAsync({ id, input: { sponsorshipId: null } });
    }

    if (!state.draft) return;

    const name = state.draft.name.trim();
    if (!name) throw new Error('Donne un nom au produit à créer.');

    const value = state.draft.value ? Number(state.draft.value.replace(',', '.')) : 0;
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('La valeur du produit doit être positive.');
    }

    await create.mutateAsync({
      name,
      value,
      status: state.draft.status,
      sponsorshipId,
      brandId: context.brandId,
      productionId: context.productionId,
      channelId: context.channelId,
      // Reçu sans date : la valorisation a besoin d'un jour pour tomber dans une période.
      receivedAt: state.draft.status === 'received' ? toIsoDate(new Date()) : null,
    });
  };

  return { apply, isPending: create.isPending || update.isPending };
};
