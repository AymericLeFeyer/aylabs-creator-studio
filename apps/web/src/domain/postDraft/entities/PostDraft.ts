/** Contrat de `/api/post-drafts`, dupliqué depuis l'API. */
import {
  isAttemptRunning,
  type PublishAttempt,
  type PublishPlatform,
} from '../../publish/entities/Publish.ts';

export type YouTubeVisibility = 'public' | 'unlisted' | 'private';
export type InstagramTrial = 'MANUAL' | 'SS_PERFORMANCE';

/**
 * Tout ce qui part avec la vidéo (dupliqué de l'API). Chaque plateforme y prend ce qu'elle
 * sait recevoir : les hashtags vont dans la description YouTube et la légende Instagram,
 * les tags seulement sur YouTube, l'essai seulement sur Instagram. TikTok, en brouillon dans
 * l'app, ne reçoit que la vidéo.
 */
export interface ShortOptions {
  hashtags: string;
  youtube: {
    tags: string;
    visibility: YouTubeVisibility;
    categoryId: string | null;
    madeForKids: boolean;
    notifySubscribers: boolean;
  };
  instagram: {
    shareToFeed: boolean;
    trial: InstagramTrial | null;
    collaborators: string;
    coverAtSeconds: number | null;
  };
}

export const DEFAULT_SHORT_OPTIONS: ShortOptions = {
  hashtags: '',
  youtube: {
    tags: '',
    visibility: 'public',
    categoryId: null,
    madeForKids: false,
    notifySubscribers: true,
  },
  instagram: { shareToFeed: true, trial: null, collaborators: '', coverAtSeconds: null },
};

export const YOUTUBE_VISIBILITY_LABELS: Record<YouTubeVisibility, string> = {
  public: 'Publique',
  unlisted: 'Non répertoriée',
  private: 'Privée',
};

/** Les catégories YouTube courantes (identifiants de l'API, région FR). */
export const YOUTUBE_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: '28', label: 'Science et technologie' },
  { id: '26', label: 'Vie pratique et style' },
  { id: '27', label: 'Éducation' },
  { id: '22', label: 'Personnes et blogs' },
  { id: '24', label: 'Divertissement' },
  { id: '19', label: 'Voyages et événements' },
  { id: '20', label: 'Jeux vidéo' },
  { id: '2', label: 'Auto et véhicules' },
  { id: '15', label: 'Animaux' },
  { id: '17', label: 'Sports' },
  { id: '10', label: 'Musique' },
  { id: '1', label: 'Films et animations' },
  { id: '23', label: 'Humour' },
  { id: '25', label: 'Actualités et politique' },
];

export const INSTAGRAM_TRIAL_LABELS: Record<InstagramTrial, string> = {
  MANUAL: 'Reel d’essai — je le partage à mes abonnés depuis l’app',
  SS_PERFORMANCE: 'Reel d’essai — Instagram le partage s’il marche',
};

/** Même règle que l'API : les hashtags à la fin, sur leur ligne, s'ils n'y sont pas déjà. */
export const captionWithHashtags = (description: string, hashtags: string): string => {
  const tags = hashtags.trim();
  const text = description.trim();
  if (!tags || text.includes(tags)) return text;
  return text ? `${text}\n\n${tags}` : tags;
};

/** Miniature YouTube et couverture Instagram. */
export interface PostDraftCover {
  url: string;
  updatedAt: string;
}

/** La vidéo déposée sur une publication (glissée sur l'écran ou envoyée par le montage). */
export interface PostDraftVideo {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Adresse d'aperçu. */
  url: string;
  createdAt: string;
}

/** Les six cases, dans l'ordre où on les coche. Liste fermée, identique côté API. */
export const POST_DRAFT_STEPS = [
  'montage',
  'miniature',
  'metricool',
  'youtube',
  'instagram',
  'tiktok',
] as const;

export type PostDraftStep = (typeof POST_DRAFT_STEPS)[number];

export const POST_DRAFT_STEP_LABELS: Record<PostDraftStep, string> = {
  montage: 'Montage',
  miniature: 'Miniature',
  metricool: 'Metricool',
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
  /** La vidéo dont la publication est tirée (teaser, insert), `null` sinon. */
  productionId: string | null;
  /** Les cases cochées, dans l'ordre de `POST_DRAFT_STEPS`. */
  steps: PostDraftStep[];
  archivedAt: string | null;
  /** `null` tant que la vidéo n'est pas arrivée. */
  video: PostDraftVideo | null;
  /** Instant UTC de la mise en ligne, `null` = pas programmée. */
  scheduledAt: string | null;
  /** Les plateformes visées (les trois par défaut). */
  platforms: PublishPlatform[];
  /** Posé au lancement : heure et plateformes sont alors figées. */
  publishStartedAt: string | null;
  /** Les envois de sa vidéo, le plus récent d'abord. */
  attempts: PublishAttempt[];
  /** Ce qui part avec la vidéo (hashtags, tags, visibilité, reel d'essai…). */
  options: ShortOptions;
  /** `null` : YouTube choisit, Instagram prend `coverAtSeconds`. */
  cover: PostDraftCover | null;
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
  /** Instant UTC ; `null` retire la programmation. 409 une fois la mise en ligne lancée. */
  scheduledAt?: string | null;
  platforms?: PublishPlatform[];
  /** Remplace toutes les options. */
  options?: ShortOptions;
}

/** Une couverture : image (base64, JPEG ≤ 2 Mo) ou miniature de Production → Miniatures. */
export type CoverSource = { image: string } | { thumbnailId: string };

/** Le dernier envoi d'une plateforme, `null` s'il n'y en a pas encore. */
export const lastAttempt = (
  draft: Pick<PostDraft, 'attempts'>,
  platform: PublishPlatform,
): PublishAttempt | null => draft.attempts.find((attempt) => attempt.platform === platform) ?? null;

/**
 * Où en est la mise en ligne d'un short, en un mot :
 * - `no_video` : la vidéo n'est pas arrivée ; `unscheduled` : elle est là, sans heure ;
 * - `scheduled` : tout est prêt, elle partira à l'heure ;
 * - `running` : un envoi est en route ; `failed` : au moins une plateforme a échoué ;
 * - `done` : chaque plateforme a fini (en ligne, ou dans la boîte TikTok).
 */
export type ShortState = 'no_video' | 'unscheduled' | 'scheduled' | 'running' | 'failed' | 'done';

export const shortState = (draft: PostDraft): ShortState => {
  if (!draft.publishStartedAt) {
    if (!draft.video) return 'no_video';
    return draft.scheduledAt && draft.platforms.length ? 'scheduled' : 'unscheduled';
  }
  const lasts = draft.platforms.map((platform) => lastAttempt(draft, platform));
  // Lancée à l'instant : les envois ne sont pas encore écrits.
  if (lasts.some((attempt) => !attempt || isAttemptRunning(attempt))) return 'running';
  if (lasts.some((attempt) => attempt?.status === 'failed')) return 'failed';
  return 'done';
};

export interface PostDraftSummary {
  /** Dernier archivage d'une publication validée (toutes cases cochées), instant UTC. */
  lastPublishedAt: string | null;
  pending: number;
}

/** La limite d'une légende Instagram, celle que l'API applique aussi. */
export const CAPTION_MAX_LENGTH = 2200;

export const isPostDraftComplete = (steps: readonly PostDraftStep[]): boolean =>
  POST_DRAFT_STEPS.every((step) => steps.includes(step));

/** Les plateformes que Metricool programme d'un coup. */
const METRICOOL_PLATFORMS: readonly PostDraftStep[] = ['youtube', 'instagram', 'tiktok'];

/**
 * Coche ou décoche une case, en gardant l'ordre canonique.
 *
 * Cocher **Metricool** coche aussi YouTube, Insta et TikTok : c'est lui qui les programme
 * tous les trois. Le décocher ne décoche que lui — les publications, elles, sont peut-être
 * déjà parties.
 */
export const toggleStep = (
  steps: readonly PostDraftStep[],
  step: PostDraftStep,
): PostDraftStep[] => {
  if (steps.includes(step)) return steps.filter((entry) => entry !== step);
  const added = step === 'metricool' ? [step, ...METRICOOL_PLATFORMS] : [step];
  return POST_DRAFT_STEPS.filter((entry) => added.includes(entry) || steps.includes(entry));
};

/**
 * Les publications qu'une vidéo terminée peut engendrer, dans l'ordre où elles sortent :
 * le teaser le jour de la sortie, puis un insert par jour, sans trou. Calcul côté API
 * (`planVideoPosts`) ; l'écran n'en montre qu'un aperçu (`previewVideoPosts`).
 */
export const VIDEO_POST_KINDS = ['teaser', 'product', 'sponsorship'] as const;
export type VideoPostKind = (typeof VIDEO_POST_KINDS)[number];

export const VIDEO_POST_KIND_LABELS: Record<VideoPostKind, string> = {
  teaser: 'Teaser vidéo',
  product: 'Insert produit',
  sponsorship: 'Insert sponso',
};

export interface PrepareVideoPostsInput {
  productionId: string;
  kinds: VideoPostKind[];
  releaseDate: string;
}

/** Même règle que l'API : un jour par publication retenue, à partir de la sortie. */
export const previewVideoPosts = (
  kinds: readonly VideoPostKind[],
): Array<{ kind: VideoPostKind; offset: number }> =>
  VIDEO_POST_KINDS.filter((kind) => kinds.includes(kind)).map((kind, offset) => ({
    kind,
    offset,
  }));

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

const pad = (value: number) => String(value).padStart(2, '0');

/** L'heure **locale** (`HH:MM`) d'un instant UTC. */
export const localTimeOf = (instant: string): string => {
  const date = new Date(instant);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** Un jour et une heure **locaux** du navigateur, en instant UTC pour l'API. */
export const instantAt = (day: string, time: string): string =>
  new Date(`${day}T${time}:00`).toISOString();

/**
 * Change le jour d'une programmation en gardant l'heure : glisser un short au lendemain le
 * fait partir le lendemain, à la même heure.
 */
export const rescheduleOnDay = (scheduledAt: string, day: string): string =>
  instantAt(day, localTimeOf(scheduledAt));
