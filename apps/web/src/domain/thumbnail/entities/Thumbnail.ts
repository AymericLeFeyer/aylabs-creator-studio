/** Les miniatures — contrat dupliqué de l'API (`apps/api/src/domain/thumbnail`). */

export type ThumbnailFormat = '16:9' | '9:16';
export type ThumbnailQuality = 'low' | 'medium' | 'high';
export type ThumbnailKeySource = 'env' | 'app' | 'unreadable' | null;

/** La limite de l'API d'OpenAI, images de la banque et images ajoutées confondues. */
export const MAX_THUMBNAIL_IMAGES = 16;

export const THUMBNAIL_FORMATS: Array<{ id: ThumbnailFormat; label: string }> = [
  { id: '16:9', label: '16:9 — YouTube' },
  { id: '9:16', label: '9:16 — vertical' },
];

/** Les modèles proposés. Un autre identifiant reste saisissable. */
export const THUMBNAIL_MODELS = [
  { id: 'gpt-image-2.5-sunburst', label: 'GPT Image 2.5 Sunburst (recommandé)' },
  { id: 'gpt-image-2.5-flare', label: 'GPT Image 2.5 Flare (plus rapide)' },
  { id: 'gpt-image-2', label: 'GPT Image 2' },
];

export const THUMBNAIL_QUALITIES: Array<{ id: ThumbnailQuality; label: string }> = [
  { id: 'low', label: 'Basse (brouillon)' },
  { id: 'medium', label: 'Moyenne' },
  { id: 'high', label: 'Haute' },
];

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

export interface ThumbnailAsset {
  id: string;
  label: string;
  createdAt: string;
}

export interface Thumbnail {
  id: string;
  productionId: string | null;
  title: string | null;
  format: ThumbnailFormat;
  prompt: string;
  createdAt: string;
}

export interface GenerateThumbnailInput {
  productionId: string | null;
  format: ThumbnailFormat;
  prompt: string;
  assetIds: string[];
  /** En base64 : envoyées à OpenAI, jamais conservées. */
  images: string[];
}

export const thumbnailUrl = (id: string): string => `/api/thumbnails/${id}/image`;
export const thumbnailAssetUrl = (id: string): string => `/api/thumbnails/assets/${id}/image`;
