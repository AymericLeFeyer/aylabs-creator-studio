import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Les six cases d'une publication, dans l'ordre où on les coche : la fabrication, puis la
 * mise en ligne sur chaque plateforme. Une liste **fermée** : en ajouter une se fait ici,
 * des deux côtés, sans migration (la colonne est un texte).
 */
export const POST_DRAFT_STEPS = [
  'montage',
  'sous_titres',
  'miniature',
  'youtube',
  'instagram',
  'tiktok',
] as const;

export type PostDraftStep = (typeof POST_DRAFT_STEPS)[number];

/**
 * Une publication **avant** qu'elle paraisse : un titre, une description, une date prévue,
 * et six cases.
 *
 * Volontairement pauvre, comme une idée : c'est un outil pour organiser son calendrier de
 * publication, pas une production. Quand tout est coché, on l'**archive** : elle sort de la
 * liste, et c'est cette publication validée qui remet à zéro le compteur « -X jours » du
 * menu.
 *
 * `description` est toujours une chaîne, jamais `null` : même règle que `script`, un
 * champ de formulaire n'a pas à distinguer « vide » de « pas encore renseigné ».
 * `plannedDate` est facultative : on note souvent une publication avant de savoir quand
 * elle sortira.
 */
export interface PostDraft {
  id: string;
  title: string;
  description: string;
  plannedDate: IsoDate | null;
  /** Les cases cochées, toujours dans l'ordre de `POST_DRAFT_STEPS`. */
  steps: PostDraftStep[];
  /** Instant UTC de l'archivage, `null` tant qu'elle est dans la liste. */
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePostDraftInput {
  title: string;
  description?: string;
  plannedDate?: IsoDate | null;
}

export interface UpdatePostDraftInput extends Partial<CreatePostDraftInput> {
  /** Remplace **toute** la liste des cases cochées. */
  steps?: PostDraftStep[];
  /** `true` archive (horodaté maintenant), `false` remet dans la liste. */
  archived?: boolean;
}

/** Ce que la pastille du menu a besoin de savoir, sans charger toute la liste. */
export interface PostDraftSummary {
  /** Dernier archivage d'une publication **validée** (toutes cases cochées). */
  lastPublishedAt: string | null;
  /** Publications encore dans la liste. */
  pending: number;
}

/** Une publication validée : toutes ses cases sont cochées. */
export const isPostDraftComplete = (steps: readonly PostDraftStep[]): boolean =>
  POST_DRAFT_STEPS.every((step) => steps.includes(step));
