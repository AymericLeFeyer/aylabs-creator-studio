import type { IsoDate } from '../../../shared/dates.ts';
import type { PublishAttempt, PublishPlatform } from '../../publish/entities/Publish.ts';

/** Les plateformes où un short part, dans l'ordre d'affichage. Les trois par défaut. */
export const SHORT_PLATFORMS: readonly PublishPlatform[] = ['youtube', 'instagram', 'tiktok'];

export type YouTubeVisibility = 'public' | 'unlisted' | 'private';

/** Reel d'essai : montré d'abord aux non-abonnés. `MANUAL` = on le promeut depuis l'app. */
export type InstagramTrial = 'MANUAL' | 'SS_PERFORMANCE';

/**
 * Tout ce qui part avec la vidéo, plateforme par plateforme. Une option ne sert pas
 * forcément partout : les hashtags vont dans la description YouTube et la légende
 * Instagram, les tags seulement sur YouTube, l'essai seulement sur Instagram. TikTok, en
 * brouillon dans l'app, ne reçoit que la vidéo.
 */
export interface ShortOptions {
  /** « #domotique #homeassistant » : ajoutés à la fin de la description et de la légende. */
  hashtags: string;
  youtube: {
    /** Séparés par des virgules ; 500 caractères au total (`fitTags`). */
    tags: string;
    visibility: YouTubeVisibility;
    /** Catégorie YouTube (`28` Science et technologie…), `null` = celle par défaut. */
    categoryId: string | null;
    madeForKids: boolean;
    notifySubscribers: boolean;
  };
  instagram: {
    /** Aussi dans la grille du profil, pas seulement l'onglet Reels. */
    shareToFeed: boolean;
    /** `null` = un Reel normal. */
    trial: InstagramTrial | null;
    /** Comptes invités en collaboration, séparés par des virgules (3 au plus). */
    collaborators: string;
    /** Sans image de couverture : l'image de la vidéo à cet instant (secondes). */
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

/** Relit le JSON stocké : une option absente (ou ajoutée depuis) prend son défaut. */
export const parseShortOptions = (raw: string): ShortOptions => {
  let stored: Partial<ShortOptions> = {};
  try {
    stored = JSON.parse(raw) as Partial<ShortOptions>;
  } catch {
    // Illisible : les défauts.
  }
  return {
    hashtags: stored.hashtags ?? DEFAULT_SHORT_OPTIONS.hashtags,
    youtube: { ...DEFAULT_SHORT_OPTIONS.youtube, ...stored.youtube },
    instagram: { ...DEFAULT_SHORT_OPTIONS.instagram, ...stored.instagram },
  };
};

/**
 * La description qui part (YouTube, légende Instagram) : la description, puis les hashtags
 * sur leur propre ligne s'ils n'y sont pas déjà.
 */
export const captionWithHashtags = (description: string, hashtags: string): string => {
  const tags = hashtags.trim();
  const text = description.trim();
  if (!tags || text.includes(tags)) return text;
  return text ? `${text}\n\n${tags}` : tags;
};

/** La couverture d'une publication : miniature YouTube et couverture Instagram. */
export interface PostDraftCover {
  /** Adresse de l'image, versionnée (`?v=`). */
  url: string;
  updatedAt: string;
}

/** La vidéo déposée sur une publication (fichier sur le disque, à côté de la base). */
export interface PostDraftVideo {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  /** Adresse d'aperçu (`/api/publish/files/<token>`). */
  url: string;
  createdAt: string;
}

/**
 * Les six cases d'une publication, dans l'ordre où on les coche : la fabrication, la
 * programmation dans Metricool, puis la mise en ligne sur chaque plateforme. Une liste
 * **fermée** : en ajouter une se fait ici, des deux côtés, sans migration (la colonne est un
 * texte, et une clé retirée — `sous_titres` — disparaît simplement à la lecture).
 */
export const POST_DRAFT_STEPS = [
  'montage',
  'miniature',
  'metricool',
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
  /** La vidéo dont la publication est tirée (teaser, insert), `null` sinon. */
  productionId: string | null;
  /** Les cases cochées, toujours dans l'ordre de `POST_DRAFT_STEPS`. */
  steps: PostDraftStep[];
  /** Instant UTC de l'archivage, `null` tant qu'elle est dans la liste. */
  archivedAt: string | null;
  /** La vidéo à mettre en ligne, `null` tant qu'elle n'est pas arrivée. */
  video: PostDraftVideo | null;
  /** Instant UTC de la mise en ligne, `null` = pas programmée. */
  scheduledAt: string | null;
  /** Les plateformes visées, dans l'ordre de `SHORT_PLATFORMS`. */
  platforms: PublishPlatform[];
  /** Posé au lancement de la mise en ligne : plus rien ne se reprogramme ensuite. */
  publishStartedAt: string | null;
  /** Les envois de sa vidéo, le plus récent d'abord. */
  attempts: PublishAttempt[];
  /** Ce qui part avec la vidéo (hashtags, tags, visibilité, reel d'essai…). */
  options: ShortOptions;
  /** `null` = pas de couverture : YouTube choisit, Instagram prend `coverAtSeconds`. */
  cover: PostDraftCover | null;
  createdAt: string;
  updatedAt: string;
}

/** Les cases qu'il reste à cocher. Vide : la publication est prête à être archivée. */
export const missingPostDraftSteps = (draft: Pick<PostDraft, 'steps'>): PostDraftStep[] =>
  POST_DRAFT_STEPS.filter((step) => !draft.steps.includes(step));

export interface CreatePostDraftInput {
  title: string;
  description?: string;
  plannedDate?: IsoDate | null;
  productionId?: string | null;
}

/**
 * Les publications qu'une vidéo terminée peut engendrer, dans l'ordre où elles sortent :
 * le teaser le jour de la sortie, puis un insert par jour. Un insert non retenu ne laisse
 * pas de trou — l'insert sponso sort à J+1 s'il n'y a pas d'insert produit.
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
  /** Le jour « pour tous » de la sortie, J du teaser. */
  releaseDate: IsoDate;
}

export interface UpdatePostDraftInput extends Partial<CreatePostDraftInput> {
  /** Remplace **toute** la liste des cases cochées. */
  steps?: PostDraftStep[];
  /** `true` archive (horodaté maintenant), `false` remet dans la liste. */
  archived?: boolean;
  /** `null` retire la programmation. Refusé (409) une fois la mise en ligne lancée. */
  scheduledAt?: string | null;
  /** Refusé (409) une fois la mise en ligne lancée. */
  platforms?: PublishPlatform[];
  /** Remplace toutes les options. */
  options?: ShortOptions;
}

/**
 * Tout ce qu'il faut pour partir à l'heure : une vidéo, une heure, au moins une
 * plateforme, et rien de lancé. Une publication archivée ne part jamais.
 */
export const isPostDraftReady = (draft: PostDraft): boolean =>
  draft.video !== null &&
  draft.scheduledAt !== null &&
  draft.platforms.length > 0 &&
  draft.publishStartedAt === null &&
  draft.archivedAt === null;

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

/**
 * Le short est **en ligne** dès qu'**une** plateforme l'a (en ligne, ou dans la boîte de
 * réception TikTok) : quelques minutes d'écart ou une plateforme en échec n'empêchent pas
 * qu'il soit paru.
 */
export const isShortOnline = (
  draft: Pick<PostDraft, 'publishStartedAt' | 'platforms' | 'attempts'>,
): boolean =>
  draft.publishStartedAt !== null &&
  draft.platforms.some((platform) => {
    const last = draft.attempts.find((attempt) => attempt.platform === platform);
    return last?.status === 'published' || last?.status === 'ready';
  });

/**
 * Paru : en ligne quelque part, ou — avant l'écran Shorts — archivé avec ses six cases
 * cochées. **Il n'y a plus d'archivage** : `archivedAt` ne vit plus que dans l'historique.
 */
export const isPostDraftOnline = (
  draft: Pick<PostDraft, 'publishStartedAt' | 'platforms' | 'attempts' | 'steps' | 'archivedAt'>,
): boolean =>
  isShortOnline(draft) || (draft.archivedAt !== null && isPostDraftComplete(draft.steps));
