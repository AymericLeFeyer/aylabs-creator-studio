/** Contrat de `/api/sponsorships`. */

export type SponsorshipStatus =
  'discussion' | 'todo' | 'in_progress' | 'awaiting_payment' | 'paid' | 'cancelled';

export const SPONSORSHIP_STATUSES: SponsorshipStatus[] = [
  'discussion',
  'todo',
  'in_progress',
  'awaiting_payment',
  'paid',
  'cancelled',
];

export const SPONSORSHIP_STATUS_LABELS: Record<SponsorshipStatus, string> = {
  discussion: 'En discussion',
  todo: 'À faire',
  in_progress: 'En cours',
  awaiting_payment: 'En attente de paiement',
  paid: 'Payée',
  cancelled: 'Annulée',
};

/**
 * La couleur du badge d'un statut, en variante du design system.
 *
 * Elle vit ici, avec les libellés, pour la même raison qu'eux : trois écrans affichent le
 * même statut, et trois teintes choisies à la main finiraient par se contredire.
 *
 * La palette suit ce que chaque statut **demande** :
 *
 * - `discussion` en ambre — rien n'est signé, c'est du conditionnel ;
 * - `todo` en gris — signé, mais rien à faire tant qu'on n'y est pas ;
 * - `in_progress` en bleu — le travail est en cours ;
 * - `awaiting_payment` en rouge — le seul statut qui **coûte de l'argent si on l'oublie**,
 *   et celui pour qui tout l'ordre de la liste a été refait ; il doit sauter aux yeux ;
 * - `paid` en vert, comme partout où l'argent est arrivé ;
 * - `cancelled` en simple contour — la ligne est morte, elle ne réclame plus rien.
 */
export const SPONSORSHIP_STATUS_BADGES: Record<
  SponsorshipStatus,
  'secondary' | 'outline' | 'positive' | 'negative' | 'cash' | 'expense'
> = {
  discussion: 'expense',
  todo: 'secondary',
  in_progress: 'cash',
  awaiting_payment: 'negative',
  paid: 'positive',
  cancelled: 'outline',
};

export const SPONSORSHIP_STATUS_HINTS: Record<SponsorshipStatus, string> = {
  discussion: 'Négociation en cours, rien de signé.',
  todo: "C'est signé, l'intégration n'est pas commencée.",
  in_progress: 'Intégration en cours de production.',
  awaiting_payment: "La vidéo est livrée, l'argent est dû. C'est celle-là qu'on relance.",
  paid: "L'argent est arrivé — c'est ce statut qui crée le revenu cash.",
  cancelled: "N'aboutira pas. Sort du montant à encaisser.",
};

/** Statuts où l'argent est attendu mais pas encaissé. */
export const PENDING_SPONSORSHIP_STATUSES: SponsorshipStatus[] = [
  'discussion',
  'todo',
  'in_progress',
  'awaiting_payment',
];

/**
 * Le rang de tri dans la liste, **avant** l'échéance. Dupliqué à l'identique côté API,
 * où il vit dans le `ORDER BY` du dépôt (voir `SPONSORSHIP_SORT_RANK`).
 *
 * Trois familles : ce qu'on doit **relancer**, ce sur quoi on doit **travailler**, puis
 * ce qui est **clos**. Trier à l'échéance seule faisait remonter une sponso encaissée il
 * y a six mois au-dessus d'une négo en cours — une fois payée, sa date de livraison ne
 * demande plus rien à personne.
 */
export const SPONSORSHIP_SORT_RANK: Record<SponsorshipStatus, number> = {
  awaiting_payment: 0,
  discussion: 1,
  todo: 1,
  in_progress: 1,
  paid: 2,
  cancelled: 3,
};

/**
 * Un plan à filmer exigé par la marque : « produit en main », « macro du logo »,
 * « code promo à l'oral ». C'est un cahier des charges de tournage, coché plan par plan.
 *
 * Propre à **une** sponso et non un référentiel partagé (contrairement aux étapes de
 * production) : chaque marque pose ses propres conditions.
 */
export interface SponsorshipRequirement {
  id: string;
  sponsorshipId: string;
  label: string;
  done: boolean;
  /** Date de réalisation. `null` tant que ce n'est pas coché. */
  doneAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface RequirementInput {
  label: string;
  done?: boolean;
  sortOrder?: number;
}

/** Plans filmés sur plans exigés — `0 / 0` quand la marque n'a rien demandé. */
export const requirementProgress = (
  requirements: SponsorshipRequirement[],
): { done: number; total: number } => ({
  done: requirements.filter((requirement) => requirement.done).length,
  total: requirements.length,
});

export interface Sponsorship {
  id: string;
  brandId: string | null;
  productionId: string | null;
  /** Sortie déjà publiée concernée, quand elle n'a pas de fiche de production. */
  videoId: string | null;
  channelId: string | null;
  /** Revenu cash généré. `null` tant que ce n'est pas payé. */
  revenueEntryId: string | null;
  label: string;
  amountCents: number;
  status: SponsorshipStatus;
  deadline: string | null;
  paidAt: string | null;
  /**
   * Le texte de l'intégration, en markdown. Sur la sponso et non sur la production :
   * une même vidéo peut en porter deux, et la sponso survit à un changement de
   * rattachement.
   */
  script: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;

  brandName: string | null;
  brandColor: string | null;
  productionTitle: string | null;
  videoTitle: string | null;
  channelName: string | null;
  /** Produits venus avec cette sponso, et leur valeur en nature une fois reçus. */
  productsCount: number;
  productsValueCents: number;
  /** Les plans à filmer exigés par la marque, dans l'ordre du cahier des charges. */
  requirements: SponsorshipRequirement[];
}

/** `amount` est en euros : l'API le convertit en centimes. */
export interface SponsorshipInput {
  label: string;
  brandId?: string | null;
  productionId?: string | null;
  videoId?: string | null;
  channelId?: string | null;
  amount?: number;
  status?: SponsorshipStatus;
  deadline?: string | null;
  paidAt?: string | null;
  script?: string;
  notes?: string | null;
}
