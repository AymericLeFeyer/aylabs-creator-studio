import type { DatabaseSync } from 'node:sqlite';
import type { IsoDate } from '../../../shared/dates.ts';
import type { DailyMetric } from '../../../domain/metrics/entities/DailyMetric.ts';
import type { ChannelSnapshot } from '../../../domain/metrics/entities/ChannelSnapshot.ts';
import type {
  DateRange,
  MetricsRepository,
} from '../../../domain/metrics/repositories/MetricsRepository.ts';

interface DailyRow {
  channel_id: string;
  date: string;
  views: number;
  watch_minutes: number;
  average_view_duration_sec: number;
  subscribers_gained: number;
  subscribers_lost: number;
  likes: number;
  comments: number;
  shares: number;
  estimated_revenue_cents: number;
  source: string;
}

interface SnapshotRow {
  channel_id: string;
  date: string;
  captured_at: string;
  subscribers: number;
  total_views: number;
  total_videos: number;
  source: string;
}

const toDailyDomain = (row: DailyRow): DailyMetric => ({
  channelId: row.channel_id,
  date: row.date,
  views: row.views,
  watchMinutes: row.watch_minutes,
  averageViewDurationSec: row.average_view_duration_sec,
  subscribersGained: row.subscribers_gained,
  subscribersLost: row.subscribers_lost,
  likes: row.likes,
  comments: row.comments,
  shares: row.shares,
  estimatedRevenueCents: row.estimated_revenue_cents,
  source: row.source as DailyMetric['source'],
});

const toSnapshotDomain = (row: SnapshotRow): ChannelSnapshot => ({
  channelId: row.channel_id,
  date: row.date,
  capturedAt: row.captured_at,
  subscribers: row.subscribers,
  totalViews: row.total_views,
  totalVideos: row.total_videos,
  source: row.source as ChannelSnapshot['source'],
});

/** Génère `?, ?, ?` pour une clause IN de longueur variable. */
const placeholders = (n: number): string => Array.from({ length: n }, () => '?').join(', ');

export class SqliteMetricsRepository implements MetricsRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  upsertDailyMetrics(metrics: DailyMetric[]): number {
    if (metrics.length === 0) return 0;

    const stmt = this.db.prepare(
      `INSERT INTO daily_metrics
         (channel_id, date, views, watch_minutes, average_view_duration_sec,
          subscribers_gained, subscribers_lost, likes, comments, shares,
          estimated_revenue_cents, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(channel_id, date) DO UPDATE SET
         views = excluded.views,
         watch_minutes = excluded.watch_minutes,
         average_view_duration_sec = excluded.average_view_duration_sec,
         subscribers_gained = excluded.subscribers_gained,
         subscribers_lost = excluded.subscribers_lost,
         likes = excluded.likes,
         comments = excluded.comments,
         shares = excluded.shares,
         estimated_revenue_cents = excluded.estimated_revenue_cents,
         source = excluded.source`,
    );

    this.db.exec('BEGIN');
    try {
      for (const m of metrics) {
        stmt.run(
          m.channelId,
          m.date,
          m.views,
          m.watchMinutes,
          m.averageViewDurationSec,
          m.subscribersGained,
          m.subscribersLost,
          m.likes,
          m.comments,
          m.shares,
          m.estimatedRevenueCents,
          m.source,
        );
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return metrics.length;
  }

  findDailyMetrics(channelIds: string[], range: DateRange): DailyMetric[] {
    if (channelIds.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT * FROM daily_metrics
          WHERE channel_id IN (${placeholders(channelIds.length)})
            AND date BETWEEN ? AND ?
          ORDER BY date`,
      )
      .all(
        ...(channelIds as never[]),
        range.from as never,
        range.to as never,
      ) as unknown as DailyRow[];
    return rows.map(toDailyDomain);
  }

  findDailyMetric(channelId: string, date: IsoDate): DailyMetric | null {
    const row = this.db
      .prepare('SELECT * FROM daily_metrics WHERE channel_id = ? AND date = ?')
      .get(channelId, date) as DailyRow | undefined;
    return row ? toDailyDomain(row) : null;
  }

  deleteDailyMetric(channelId: string, date: IsoDate): void {
    this.db
      .prepare('DELETE FROM daily_metrics WHERE channel_id = ? AND date = ?')
      .run(channelId, date);
  }

  findLastMetricDate(channelId: string): IsoDate | null {
    const row = this.db
      .prepare('SELECT MAX(date) AS d FROM daily_metrics WHERE channel_id = ?')
      .get(channelId) as { d: string | null } | undefined;
    return row?.d ?? null;
  }

  upsertSnapshot(snapshot: ChannelSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO channel_snapshots
           (channel_id, date, captured_at, subscribers, total_views, total_videos, source)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(channel_id, date) DO UPDATE SET
           captured_at = excluded.captured_at,
           subscribers = excluded.subscribers,
           total_views = excluded.total_views,
           total_videos = excluded.total_videos,
           source = excluded.source`,
      )
      .run(
        snapshot.channelId,
        snapshot.date,
        snapshot.capturedAt,
        snapshot.subscribers,
        snapshot.totalViews,
        snapshot.totalVideos,
        snapshot.source,
      );
  }

  findSnapshots(channelIds: string[], range: DateRange): ChannelSnapshot[] {
    if (channelIds.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT * FROM channel_snapshots
          WHERE channel_id IN (${placeholders(channelIds.length)})
            AND date BETWEEN ? AND ?
          ORDER BY date`,
      )
      .all(
        ...(channelIds as never[]),
        range.from as never,
        range.to as never,
      ) as unknown as SnapshotRow[];
    return rows.map(toSnapshotDomain);
  }

  findLatestSnapshotAt(channelId: string, date: IsoDate): ChannelSnapshot | null {
    const row = this.db
      .prepare(
        `SELECT * FROM channel_snapshots
          WHERE channel_id = ? AND date <= ?
          ORDER BY date DESC LIMIT 1`,
      )
      .get(channelId, date) as SnapshotRow | undefined;
    return row ? toSnapshotDomain(row) : null;
  }

  findLatestSnapshot(channelId: string): ChannelSnapshot | null {
    const row = this.db
      .prepare('SELECT * FROM channel_snapshots WHERE channel_id = ? ORDER BY date DESC LIMIT 1')
      .get(channelId) as SnapshotRow | undefined;
    return row ? toSnapshotDomain(row) : null;
  }
}
