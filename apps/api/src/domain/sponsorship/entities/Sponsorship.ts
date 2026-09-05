import type { IsoDate } from '../../../shared/dates.ts';
import type { Cents } from '../../../shared/money.ts';

/**
 * Cycle de vie d'une sponso.
 *
 * `discussion` → on négocie ; `todo` → c'est signé, rien n'est produit ; `in_progress`
 * → l'intégration est en cours ; `awaiting_payment` → **livré, l'argent est dû** ;
 * `paid` → l'argent est arrivé. `cancelled` complète l'ensemble : sans lui, une négo qui
 * n'aboutit pas reste dans le pipeline à vie et fausse le montant « à encaisser ».
 *
 * `awaiting_payment` était jusqu'ici indistinguable d'`in_progress`, alors que les deux
 * appellent des gestes opposés : l'un demande de monter, l'autre de relancer. C'est le
 * seul statut sur lequel on peut agir tout de suite, et c'est pour ça qu'il passe en tête
 * de la liste des sponsos (`SPONSORSHIP_SORT_RANK`).
 */
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

/** Statuts où l'argent est attendu mais pas encaissé : ce que totalise « en cours ». */
export const PENDING_SPONSORSHIP_STATUSES: SponsorshipStatus[] = [
  'discussion',
  'todo',
  'in_progress',
  'awaiting_payment',
];

/**
 * Le rang de tri d'une sponso dans la liste, **avant** l'échéance.
 *
 * L'échéance seule ferait remonter une sponso encaissée il y a six mois au-dessus d'une
 * négo en cours : une fois payée, sa date de livraison ne demande plus rien à personne.
 * Trois familles, donc, et l'échéance ne départage qu'à l'intérieur de chacune :
 * ce qu'on doit **relancer**, ce sur quoi on doit **travailler**, puis ce qui est **clos**.
 *
 * Dupliqué à l'identique côté front : le tri vit dans le `ORDER BY` du dépôt (donc il
 * vaut aussi pour les sélecteurs de rattachement), et cette table le rend lisible.
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
  /** Sortie déjà publiée concernée, quand elle n'a pas de fiche de production. */
  videoId: string | null;
  channelId: string | null;
  /** Revenu cash généré. `null` tant que ce n'est pas payé. */
  revenueEntryId: string | null;
  label: string;
  amountCents: Cents;
  status: SponsorshipStatus;
  /** Échéance de livraison : la date à laquelle la vidéo doit être en ligne. */
  deadline: IsoDate | null;
  paidAt: IsoDate | null;
  /**
   * Le texte de l'intégration, en markdown : éléments de langage, mentions
   * obligatoires, code promo. Il vit sur la sponso et non sur la production — une même
   * vidéo peut en porter deux, et la sponso survit à un changement de rattachement.
   */
  script: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Un plan à filmer exigé par la marque : « produit en main », « macro du logo »,
 * « code promo à l'oral ». C'est un cahier des charges de tournage, coché plan par plan.
 *
 * Propre à **une** sponso et non un référentiel partagé (contrairement aux étapes de
 * production) : chaque marque pose ses propres conditions, et les mutualiser
 * obligerait à cocher des plans que ce partenariat-là n'a jamais demandés.
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

export interface CreateRequirementInput {
  label: string;
}

export interface UpdateRequirementInput {
  label?: string;
  done?: boolean;
  sortOrder?: number;
}

export interface SponsorshipView extends Sponsorship {
  brandName: string | null;
  brandColor: string | null;
  productionTitle: string | null;
  videoTitle: string | null;
  channelName: string | null;
  /** Produits venus avec cette sponso, et leur valeur cumulée en nature. */
  productsCount: number;
  productsValueCents: Cents;
  /**
   * Les plans à filmer exigés par la marque. Chargés en **une** requête pour tout le
   * lot : les joindre à la ligne de sponso la multiplierait par le nombre de plans.
   */
  requirements: SponsorshipRequirement[];
}

export interface CreateSponsorshipInput {
  label: string;
  brandId?: string | null;
  productionId?: string | null;
  videoId?: string | null;
  channelId?: string | null;
  amountCents?: Cents;
  status?: SponsorshipStatus;
  deadline?: IsoDate | null;
  paidAt?: IsoDate | null;
  script?: string;
  notes?: string | null;
}

export type UpdateSponsorshipInput = Partial<CreateSponsorshipInput>;
