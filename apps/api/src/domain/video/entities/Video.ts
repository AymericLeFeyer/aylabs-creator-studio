import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Une vidéo publiée, gardée uniquement comme **repère temporel** : elle sert à poser un
 * trait sur les graphiques au jour de sa sortie. Aucune statistique par vidéo n'est
 * stockée — ça resterait à construire si le besoin apparaît.
 */
export interface Video {
  id: string;
  channelId: string;
  /** Identifiant YouTube de la vidéo (11 caractères). */
  externalId: string;
  title: string;
  /** Horodatage complet renvoyé par YouTube. */
  publishedAt: string;
  /** Jour de publication, en UTC comme le reste des séries. */
  date: IsoDate;
  thumbnailUrl: string | null;
}

export type UpsertVideoInput = Omit<Video, 'id'>;
