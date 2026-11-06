import type { CoverSource } from '../../../domain/postDraft/entities/PostDraft.ts';
import { thumbnailUrl, type Thumbnail } from '../../../domain/thumbnail/entities/Thumbnail.ts';

/** Ce que le formulaire retient : la source à envoyer, et de quoi l'afficher. */
export interface PickedCover {
  /** `null` : la couverture déjà posée, gardée telle quelle. */
  source: CoverSource | null;
  previewUrl: string;
}

/** La miniature à proposer d'office : l'enregistrée de la vidéo, en 9:16 de préférence. */
export const suggestedCover = (saved: Thumbnail[]): PickedCover | null => {
  const best = saved.find((thumbnail) => thumbnail.format === '9:16') ?? saved[0];
  return best ? { source: { thumbnailId: best.id }, previewUrl: thumbnailUrl(best.id) } : null;
};
