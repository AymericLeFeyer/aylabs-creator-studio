import type { ThumbnailFormat } from '../../../domain/thumbnail/entities/Thumbnail.ts';

/** La classe d'aspect d'une miniature, pour l'image comme pour sa place réservée. */
export const THUMBNAIL_RATIO: Record<ThumbnailFormat, string> = {
  '16:9': 'aspect-video',
  '9:16': 'aspect-[9/16]',
};
