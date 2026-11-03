export type ThumbnailFormat = '16:9' | '9:16';
export type ThumbnailQuality = 'low' | 'medium' | 'high';
export type ThumbnailKeySource = 'env' | 'app' | 'unreadable' | null;

export const DEFAULT_THUMBNAIL_MODEL = 'gpt-image-2.5-sunburst';
export const DEFAULT_THUMBNAIL_QUALITY: ThumbnailQuality = 'high';

/** La limite de l'API d'OpenAI, images de la banque et images ajoutées confondues. */
export const MAX_THUMBNAIL_IMAGES = 16;

/**
 * Les deux côtés doivent être divisibles par 16. Pas de 1920 × 1080 possible (1080 ne l'est
 * pas) : 1536 × 864 est un vrai 16:9, et reste au-dessus du minimum de YouTube (1280 × 720).
 */
export const THUMBNAIL_SIZES: Record<ThumbnailFormat, string> = {
  '16:9': '1536x864',
  '9:16': '864x1536',
};

/** Clé et modèle d'OpenAI, plus le prompt général. Ligne unique. */
export interface StoredThumbnailSettings {
  encryptedApiKey: string | null;
  model: string | null;
  quality: ThumbnailQuality;
  generalPrompt: string;
}

export interface ThumbnailSettingsView {
  keySource: ThumbnailKeySource;
  model: string;
  quality: ThumbnailQuality;
  generalPrompt: string;
  secretsKeyConfigured: boolean;
  configured: boolean;
}

export interface ThumbnailSettingsInput {
  /** Absent = conservée, `null` = effacée. */
  apiKey?: string | null;
  model?: string | null;
  quality?: ThumbnailQuality;
  generalPrompt?: string;
}

export interface ThumbnailImage {
  data: Uint8Array;
  mimeType: string;
}

/** Une image de la banque. */
export interface ThumbnailAsset {
  id: string;
  label: string;
  createdAt: string;
}

export interface Thumbnail {
  id: string;
  productionId: string | null;
  /** Copié à la génération : une miniature survit à la suppression de sa vidéo. */
  title: string | null;
  format: ThumbnailFormat;
  /** Le prompt personnalisé seul, pas le prompt envoyé en entier. */
  prompt: string;
  /**
   * Posé par « Enregistrer » : la miniature est gardée pour sa vidéo et s'affiche dans
   * l'onglet Miniatures de la fiche. `null` = simple génération de l'historique.
   */
  savedAt: string | null;
  createdAt: string;
}

/**
 * L'étape cochée quand une miniature est enregistrée sur une vidéo : identifiant fixe
 * du seed (`seedDefaultSteps`), jamais le libellé, qui se renomme.
 */
export const THUMBNAIL_STEP_ID = 'miniature';

export interface GenerateThumbnailInput {
  productionId: string | null;
  format: ThumbnailFormat;
  prompt: string;
  /** Les images de la banque retenues. */
  assetIds: string[];
  /** Les images ajoutées pour cette génération : envoyées à OpenAI, jamais conservées. */
  images: Uint8Array[];
}

export interface ThumbnailCredentials {
  apiKey: string;
  model: string;
  quality: ThumbnailQuality;
}
