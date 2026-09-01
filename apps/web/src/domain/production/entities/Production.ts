/** Contrat de `/api/productions`. */

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
  notes: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;

  channelName: string | null;
  channelColor: string | null;
  videoTitle: string | null;
  videoExternalId: string | null;
  videoThumbnailUrl: string | null;
  /** Étapes cochées. Un identifiant absent vaut « pas fait ». */
  steps: ProductionStepCheck[];
  nextSlotDate: string | null;
  slotsCount: number;
  productsCount: number;
  productsPendingCount: number;
  sponsorshipsCount: number;
  sponsorshipsPendingCents: number;
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
  notes?: string | null;
}

/** Part d'étapes cochées, entre 0 et 1. `0` quand aucune étape n'est configurée. */
export const stepProgress = (production: Production, totalSteps: number): number =>
  totalSteps === 0 ? 0 : production.steps.length / totalSteps;

export const isStepChecked = (production: Production, stepId: string): boolean =>
  production.steps.some((step) => step.stepId === stepId);
