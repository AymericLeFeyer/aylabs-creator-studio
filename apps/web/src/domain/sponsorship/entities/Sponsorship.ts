/** Contrat de `/api/sponsorships`. */

export type SponsorshipStatus = 'discussion' | 'todo' | 'in_progress' | 'paid' | 'cancelled';

export const SPONSORSHIP_STATUSES: SponsorshipStatus[] = [
  'discussion',
  'todo',
  'in_progress',
  'paid',
  'cancelled',
];

export const SPONSORSHIP_STATUS_LABELS: Record<SponsorshipStatus, string> = {
  discussion: 'En discussion',
  todo: 'À faire',
  in_progress: 'En cours',
  paid: 'Payée',
  cancelled: 'Annulée',
};

export const SPONSORSHIP_STATUS_HINTS: Record<SponsorshipStatus, string> = {
  discussion: 'Négociation en cours, rien de signé.',
  todo: "C'est signé, l'intégration n'est pas commencée.",
  in_progress: 'Intégration en cours de production.',
  paid: "L'argent est arrivé — c'est ce statut qui crée le revenu cash.",
  cancelled: "N'aboutira pas. Sort du montant à encaisser.",
};

/** Statuts où l'argent est attendu mais pas encaissé. */
export const PENDING_SPONSORSHIP_STATUSES: SponsorshipStatus[] = [
  'discussion',
  'todo',
  'in_progress',
];

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
  notes?: string | null;
}
