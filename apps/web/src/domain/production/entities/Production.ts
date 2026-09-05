/** Contrat de `/api/productions`. */

import { PENDING_PRODUCT_STATUSES, type ProductStatus } from '../../product/entities/Product.ts';
import {
  PENDING_SPONSORSHIP_STATUSES,
  type SponsorshipStatus,
} from '../../sponsorship/entities/Sponsorship.ts';
import type { TodoItem } from './StepTodo.ts';

export type ProductionStatus = 'idea' | 'in_progress' | 'paused' | 'done';

export const PRODUCTION_STATUSES: ProductionStatus[] = ['idea', 'in_progress', 'paused', 'done'];

/** Les libellés vivent ici uniquement : les renommer ne touche ni la base ni l'API. */
export const STATUS_LABELS: Record<ProductionStatus, string> = {
  idea: 'Idée',
  in_progress: 'En cours',
  paused: 'En pause',
  done: 'Terminée',
};

export const STATUS_HINTS: Record<ProductionStatus, string> = {
  idea: 'Notée, pas encore commencée. Elle attend son tour dans la file.',
  in_progress: 'Le travail est lancé.',
  paused: "Bloquée par quelqu'un d'autre : un retour de marque, un produit qui n'arrive pas.",
  done: 'Publiée. Elle quitte la file et rejoint les terminées, sans rien perdre.',
};

/** Couleur de la pastille de statut, en variable CSS du thème. */
export const STATUS_COLORS: Record<ProductionStatus, string> = {
  idea: 'var(--muted-foreground)',
  in_progress: 'var(--positive)',
  paused: 'var(--expense)',
  done: 'var(--in-kind)',
};

/**
 * Version courte d'un produit ou d'une sponso rattachés.
 *
 * La vue porte les **listes** et non des compteurs : « 2 produits » ne dit pas lesquels,
 * et c'est précisément ce qu'on veut au survol d'une carte. Compteurs et montants en
 * attente se dérivent (`partnerCounts`) — une seule source, rien à resynchroniser.
 */
export interface ProductionProductRef {
  id: string;
  name: string;
  status: ProductStatus;
  valueCents: number;
}

export interface ProductionSponsorshipRef {
  id: string;
  label: string;
  status: SponsorshipStatus;
  amountCents: number;
}

export interface ProductionStepCheck {
  stepId: string;
  checkedAt: string;
}

export interface Production {
  id: string;
  channelId: string | null;
  /** Sortie réelle rattachée. `null` tant que la vidéo n'est pas publiée. */
  videoId: string | null;
  title: string;
  status: ProductionStatus;
  pausedReason: string | null;
  pausedAt: string | null;
  startDate: string | null;
  plannedDate: string | null;
  script: string;
  /**
   * Le formulaire de mise en ligne, préparé avant que la vidéo existe.
   *
   * `publishTitle` est le titre **public** et non le titre de travail : l'accroche qui
   * fera cliquer se trouve rarement le jour où l'on ouvre le projet, et confondre les
   * deux ferait perdre l'un des deux.
   */
  publishTitle: string;
  publishDescription: string;
  publishHashtags: string;
  publishTags: string;
  /**
   * Case « contient une communication commerciale ». **`null` = pas encore tranché** :
   * la case se déduit alors de la présence d'une sponso rattachée
   * (`resolvePaidPromotion`). C'est un troisième état, pas un `false` déguisé.
   */
  paidPromotion: boolean | null;
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;

  channelName: string | null;
  channelColor: string | null;
  videoTitle: string | null;
  /** Jour de la sortie réelle. `null` tant qu'aucune vidéo n'est rattachée. */
  videoDate: string | null;
  videoExternalId: string | null;
  videoThumbnailUrl: string | null;
  /** Étapes cochées. Un identifiant absent vaut « pas fait ». */
  steps: ProductionStepCheck[];
  nextSlotDate: string | null;
  slotsCount: number;
  products: ProductionProductRef[];
  sponsorships: ProductionSponsorshipRef[];
  /** Tâches de la vidéo, référentiel d'étape et ponctuelles réunies, avec leur état. */
  todos: TodoItem[];
  /** Temps déjà enregistré, en minutes (sessions closes seulement). */
  trackedMinutes: number;
}

export interface ProductionInput {
  title: string;
  channelId?: string | null;
  videoId?: string | null;
  status?: ProductionStatus;
  pausedReason?: string | null;
  startDate?: string | null;
  plannedDate?: string | null;
  script?: string;
  publishTitle?: string;
  publishDescription?: string;
  publishHashtags?: string;
  publishTags?: string;
  paidPromotion?: boolean | null;
  notes?: string | null;
}

/**
 * La fiche de mise en ligne d'une sortie déjà publiée, lue sur YouTube.
 *
 * Sert au bouton « charger depuis la précédente » : une description de chaîne est un
 * gabarit — liens d'affiliation, réseaux, chapitres, mentions — qu'on réécrit à 90 %
 * identique à chaque sortie, et le retaper de mémoire est le meilleur moyen d'oublier un
 * lien.
 */
export interface PreviousPublication {
  videoId: string;
  externalId: string;
  title: string;
  publishedAt: string;
  date: string;
  description: string;
  tags: string[];
}

/**
 * La case « collaboration commerciale », résolue.
 *
 * Tant que personne n'y a touché (`null`), elle **suit les sponsos rattachées** : une
 * vidéo sponsorisée doit porter la mention, et attendre qu'on y pense est exactement la
 * façon de l'oublier. Dès qu'on coche ou décoche, le choix explicite l'emporte pour
 * toujours — on peut avoir une bonne raison de ne pas déclarer un produit offert de
 * faible valeur, ou de déclarer une vidéo qui n'a pas de sponso dans l'outil.
 *
 * Les sponsos `cancelled` ne comptent pas : une négo morte n'oblige à rien.
 */
export const resolvePaidPromotion = (production: Production): boolean =>
  production.paidPromotion ??
  production.sponsorships.some((sponsorship) => sponsorship.status !== 'cancelled');

/**
 * Avancement d'une vidéo, entre 0 et 1.
 *
 * **Une tâche pèse autant qu'une étape.** Une étape à cinq tâches vaut donc six points
 * dans le total, ce qui est voulu : c'est là qu'est le travail, et une barre qui ne
 * compterait que les étapes sauterait de 0 à 20 % sans rien montrer entre les deux.
 *
 * Le même calcul tourne côté API pour l'avancement moyen de la file
 * (`GetProductionOverview.buildStats`) : deux pondérations différentes feraient dire
 * deux choses au même écran.
 */
export const stepProgress = (production: Production, totalSteps: number): number => {
  const total = totalSteps + production.todos.length;
  if (total === 0) return 0;
  const done = production.steps.length + production.todos.filter((todo) => todo.checked).length;
  return Math.min(1, done / total);
};

/** Le détail derrière la barre : « 7/12 » se lit mieux qu'un pourcentage sur une carte. */
export const progressCounts = (
  production: Production,
  totalSteps: number,
): { done: number; total: number } => ({
  done: production.steps.length + production.todos.filter((todo) => todo.checked).length,
  total: totalSteps + production.todos.length,
});

export const isStepChecked = (production: Production, stepId: string): boolean =>
  production.steps.some((step) => step.stepId === stepId);

/**
 * Ce que les cartes et les barres résument des partenaires rattachés.
 * Dérivé des listes : deux affichages qui comptent différemment finiraient par se
 * contredire sur la même vidéo.
 */
export const partnerCounts = (production: Production) => ({
  products: production.products.length,
  /** Produits pas encore reçus : ce sont eux qui bloquent une production. */
  productsPending: production.products.filter((product) =>
    PENDING_PRODUCT_STATUSES.includes(product.status),
  ).length,
  sponsorships: production.sponsorships.length,
  /** Sponsos rattachées pas encore encaissées, en centimes. */
  sponsorshipsPendingCents: production.sponsorships
    .filter((sponsorship) => PENDING_SPONSORSHIP_STATUSES.includes(sponsorship.status))
    .reduce((total, sponsorship) => total + sponsorship.amountCents, 0),
});
