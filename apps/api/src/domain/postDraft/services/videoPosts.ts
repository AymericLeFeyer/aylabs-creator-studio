import { addDays, type IsoDate } from '../../../shared/dates.ts';
import { VIDEO_POST_KINDS, type VideoPostKind } from '../entities/PostDraft.ts';

/**
 * Le calendrier des publications tirées d'une vidéo : dans l'ordre canonique (teaser,
 * insert produit, insert sponso), un jour chacune à partir de la sortie, **sans trou** —
 * l'insert sponso sort à J+1 quand l'insert produit n'est pas retenu.
 */
export const planVideoPosts = (
  kinds: readonly VideoPostKind[],
  releaseDate: IsoDate,
): Array<{ kind: VideoPostKind; date: IsoDate }> =>
  VIDEO_POST_KINDS.filter((kind) => kinds.includes(kind)).map((kind, index) => ({
    kind,
    date: addDays(releaseDate, index),
  }));
