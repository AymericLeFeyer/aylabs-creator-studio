import type { IsoDate } from '../../../shared/dates.ts';
import type { DateRange } from '../../metrics/repositories/MetricsRepository.ts';
import type { UpsertVideoInput, Video } from '../entities/Video.ts';

export interface VideoFilter {
  range?: DateRange;
  /** Vide ou absent = toutes les chaînes. */
  channelIds?: string[];
  /** Garde-fou d'affichage : au-delà, le graphique ne serait plus lisible. */
  limit?: number;
}

export interface VideoRepository {
  findAll(filter?: VideoFilter): Video[];
  /** Insère ou met à jour (titre, miniature) par `(channelId, externalId)`. */
  upsertMany(videos: UpsertVideoInput[]): number;
  /** Jour de la dernière vidéo connue, pour ne re-parcourir que le nécessaire. */
  findLatestDate(channelId: string): IsoDate | null;
  countByChannel(channelId: string): number;
}
