import type { IsoDate } from '../../../shared/dates.ts';
import type { Cents } from '../../../shared/money.ts';
import type { ProductStatus } from '../../product/entities/Product.ts';
import type { SponsorshipStatus } from '../../sponsorship/entities/Sponsorship.ts';

/**
 * Où en est une vidéo, indépendamment des cases cochées.
 *
 * `paused` existe séparément parce qu'une vidéo peut être bloquée sans qu'aucune étape
 * ne l'explique : on attend le retour d'une marque, la livraison d'un produit. Cocher
 * ou non « montage » ne dit pas ça.
 */
export type ProductionStatus = 'idea' | 'in_progress' | 'paused' | 'done';

export const PRODUCTION_STATUSES: ProductionStatus[] = ['idea', 'in_progress', 'paused', 'done'];

/**
 * Une vidéo en préparation.
 *
 * Elle vit avant la publication, puis se rattache à la ligne `videos` collectée sur
 * YouTube (`videoId`) le jour de la sortie. Rien n'est supprimé à ce moment-là : la
 * production sort simplement de la file d'attente pour rejoindre les terminées, avec
 * son script et ses créneaux intacts.
 */
export interface Production {
  id: string;
  /** Chaîne visée. `null` tant que ce n'est pas tranché — ça peut varier. */
  channelId: string | null;
  /** Sortie réelle correspondante. `null` tant que la vidéo n'est pas publiée. */
  videoId: string | null;
  title: string;
  status: ProductionStatus;
  /** Pourquoi ça n'avance pas. N'a de sens qu'en statut `paused`. */
  pausedReason: string | null;
  /** Depuis quand c'est en pause, pour afficher « bloquée depuis 12 jours ». */
  pausedAt: string | null;
  /** Début de la barre sur le planning. */
  startDate: IsoDate | null;
  /** Date de sortie visée : fin de la barre sur le planning. */
  plannedDate: IsoDate | null;
  /** Le script, en markdown. Toujours une chaîne, jamais `null` : simplifie l'éditeur. */
  script: string;
  notes: string | null;
  /** Rang dans la file d'attente. Ordre entièrement manuel. */
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Version courte d'un produit ou d'une sponso rattachés.
 *
 * La vue porte les **listes** et non des compteurs : « 2 produits » ne dit pas lesquels,
 * et c'est précisément ce qu'on veut savoir au survol d'une carte. Les compteurs et les
 * montants en attente se dérivent de la liste — une seule source, rien à resynchroniser.
 */
export interface ProductionProductRef {
  id: string;
  name: string;
  status: ProductStatus;
  valueCents: Cents;
}

export interface ProductionSponsorshipRef {
  id: string;
  label: string;
  status: SponsorshipStatus;
  amountCents: Cents;
}

/** Étape cochée sur une production, avec la date à laquelle elle l'a été. */
export interface ProductionStepCheck {
  stepId: string;
  checkedAt: string;
}

/**
 * Vue complète d'une production, telle que le front la consomme : tout ce qu'il faut
 * pour afficher une ligne de file d'attente sans une requête de plus par carte.
 */
export interface ProductionView extends Production {
  channelName: string | null;
  channelColor: string | null;
  /** Titre de la vidéo publiée, quand elle est rattachée. */
  videoTitle: string | null;
  videoExternalId: string | null;
  videoThumbnailUrl: string | null;
  /** Étapes cochées. L'absence d'un identifiant vaut « pas fait ». */
  steps: ProductionStepCheck[];
  /** Prochain créneau non fait à venir, `null` s'il n'y en a pas de planifié. */
  nextSlotDate: IsoDate | null;
  slotsCount: number;
  /** Produits et sponsos rattachés, en version courte. Les compteurs s'en dérivent. */
  products: ProductionProductRef[];
  sponsorships: ProductionSponsorshipRef[];
}

export interface CreateProductionInput {
  title: string;
  channelId?: string | null;
  videoId?: string | null;
  status?: ProductionStatus;
  pausedReason?: string | null;
  startDate?: IsoDate | null;
  plannedDate?: IsoDate | null;
  script?: string;
  notes?: string | null;
}

export type UpdateProductionInput = Partial<CreateProductionInput> & { sortOrder?: number };
