import type { IsoDate } from '../../../shared/dates.ts';
import type { DateRange } from '../../metrics/repositories/MetricsRepository.ts';
import type {
  UpsertVideoInput,
  Video,
  VideoRangeStats,
  VideoStatsUpdate,
  VideoView,
} from '../entities/Video.ts';

export interface VideoFilter {
  range?: DateRange;
  /** Vide ou absent = toutes les chaînes. */
  channelIds?: string[];
  /** Garde-fou d'affichage : au-delà, le graphique ne serait plus lisible. */
  limit?: number;
}

export interface VideoRepository {
  findAll(filter?: VideoFilter): Video[];
  /** Même liste, enrichie de la chaîne : pour les sélecteurs et le tableau du dashboard. */
  findAllWithChannel(filter?: VideoFilter): VideoView[];
  findById(id: string): Video | null;
  /** Insère ou met à jour (titre, miniature) par `(channelId, externalId)`. */
  upsertMany(videos: UpsertVideoInput[]): number;
  /** Remplace les compteurs d'une vidéo. Les compteurs sont des cumuls, jamais additionnés. */
  upsertStats(updates: VideoStatsUpdate[]): number;
  /**
   * Ce que des vidéos ont fait sur une période, par différence de relevés datés.
   * Une vidéo sans relevé antérieur à la période est **absente** du résultat : on ne
   * peut pas séparer sa part de période de son cumul d'avant.
   */
  sumStatsOverRange(videoIds: string[], range: DateRange): Map<string, VideoRangeStats>;
  /** Compte les sorties de la période, sans les charger (le `limit` de `findAll` fausserait). */
  countInRange(channelIds: string[], range: DateRange): number;
  /** Jour de la dernière vidéo connue, pour ne re-parcourir que le nécessaire. */
  findLatestDate(channelId: string): IsoDate | null;
  countByChannel(channelId: string): number;
}
