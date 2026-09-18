/** Contrat de `/api/post-drafts`, dupliqué depuis l'API. */

/** Les six cases, dans l'ordre où on les coche. Liste fermée, identique côté API. */
export const POST_DRAFT_STEPS = [
  'montage',
  'sous_titres',
  'miniature',
  'youtube',
  'instagram',
  'tiktok',
] as const;

export type PostDraftStep = (typeof POST_DRAFT_STEPS)[number];

export const POST_DRAFT_STEP_LABELS: Record<PostDraftStep, string> = {
  montage: 'Montage',
  sous_titres: 'Sous-titres',
  miniature: 'Miniature',
  youtube: 'YouTube',
  instagram: 'Insta',
  tiktok: 'TikTok',
};

/**
 * Une publication avant sa parution : un titre, une description, une date prévue, six
 * cases. Toutes cochées, on l'archive — c'est une publication **validée**, celle qui remet
 * à zéro le compteur du menu. Ce qui est paru se lit dans Audience → Instagram.
 */
export interface PostDraft {
  id: string;
  title: string;
  /** Jamais `null` : un champ vide est une chaîne vide. */
  description: string;
  plannedDate: string | null;
  /** Les cases cochées, dans l'ordre de `POST_DRAFT_STEPS`. */
  steps: PostDraftStep[];
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostDraftInput {
  title: string;
  description?: string;
  /** `null` efface la date, absent la conserve. */
  plannedDate?: string | null;
}

export interface PostDraftUpdate extends Partial<PostDraftInput> {
  /** Remplace toute la liste des cases cochées. */
  steps?: PostDraftStep[];
  archived?: boolean;
}

export interface PostDraftSummary {
  /** Dernier archivage d'une publication validée (toutes cases cochées), instant UTC. */
  lastPublishedAt: string | null;
  pending: number;
}

/** La limite d'une légende Instagram, celle que l'API applique aussi. */
export const CAPTION_MAX_LENGTH = 2200;

export const isPostDraftComplete = (steps: readonly PostDraftStep[]): boolean =>
  POST_DRAFT_STEPS.every((step) => steps.includes(step));

/** Coche ou décoche une case, en gardant l'ordre canonique. */
export const toggleStep = (
  steps: readonly PostDraftStep[],
  step: PostDraftStep,
): PostDraftStep[] =>
  steps.includes(step)
    ? steps.filter((entry) => entry !== step)
    : POST_DRAFT_STEPS.filter((entry) => entry === step || steps.includes(entry));

/**
 * Nombre de jours entre deux dates sans heure — négatif si `date` est avant `today`.
 * Des jours de calendrier, jamais des heures écoulées : les deux bornes sont lues au
 * même minuit.
 */
export const daysUntil = (date: string, today: string): number =>
  Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);

/** Le jour **local** d'un instant UTC : une publication validée à 0 h 30 compte pour ce jour-là. */
export const localDateOf = (instant: string): string => {
  const date = new Date(instant);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
