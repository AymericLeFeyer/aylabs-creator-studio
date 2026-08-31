import type { IsoDate } from '../../../shared/dates.ts';
import type { DailyMetric } from '../entities/DailyMetric.ts';
import type { ChannelSnapshot } from '../entities/ChannelSnapshot.ts';

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

export interface MetricsRepository {
  /** Insère ou met à jour les métriques du jour (clé : channelId + date). */
  upsertDailyMetrics(metrics: DailyMetric[]): number;
  findDailyMetrics(channelIds: string[], range: DateRange): DailyMetric[];
  findDailyMetric(channelId: string, date: IsoDate): DailyMetric | null;
  deleteDailyMetric(channelId: string, date: IsoDate): void;
  /** Date de la mesure la plus récente, pour ne re-collecter que le delta. */
  findLastMetricDate(channelId: string): IsoDate | null;

  upsertSnapshot(snapshot: ChannelSnapshot): void;
  findSnapshots(channelIds: string[], range: DateRange): ChannelSnapshot[];
  /** Dernier snapshot connu à la date donnée (ou avant), pour combler les trous. */
  findLatestSnapshotAt(channelId: string, date: IsoDate): ChannelSnapshot | null;
  findLatestSnapshot(channelId: string): ChannelSnapshot | null;
}
