import type { DatabaseSync } from 'node:sqlite';
import type { IsoDate } from '../../../shared/dates.ts';
import type { DateRange } from '../../../domain/metrics/repositories/MetricsRepository.ts';
import type {
  UpsertVideoInput,
  Video,
  VideoStatsUpdate,
  VideoView,
} from '../../../domain/video/entities/Video.ts';
import type {
  VideoFilter,
  VideoRepository,
} from '../../../domain/video/repositories/VideoRepository.ts';
import { placeholders } from '../../db/filters.ts';
import { newId } from '../../../shared/id.ts';

interface VideoRow {
  id: string;
  channel_id: string;
  external_id: string;
  title: string;
  published_at: string;
  date: string;
  thumbnail_url: string | null;
  views: number;
  watch_minutes: number;
  subscribers_gained: number;
  likes: number;
  comments: number;
  estimated_revenue_cents: number;
  stats_updated_at: string | null;
}

interface VideoViewRow extends VideoRow {
  channel_name: string;
  channel_color: string;
}

const toDomain = (row: VideoRow): Video => ({
  id: row.id,
  channelId: row.channel_id,
  externalId: row.external_id,
  title: row.title,
  publishedAt: row.published_at,
  date: row.date,
  thumbnailUrl: row.thumbnail_url,
  stats: {
    views: row.views,
    watchMinutes: row.watch_minutes,
    subscribersGained: row.subscribers_gained,
    likes: row.likes,
    comments: row.comments,
    estimatedRevenueCents: row.estimated_revenue_cents,
    updatedAt: row.stats_updated_at,
  },
});

export class SqliteVideoRepository implements VideoRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** Clause commune aux deux lectures, pour que la liste enrichie filtre à l'identique. */
  private buildWhere(filter: VideoFilter, alias: string): { clause: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.range) {
      conditions.push(`${alias}.date BETWEEN ? AND ?`);
      params.push(filter.range.from, filter.range.to);
    }
    const channelIds = filter.channelIds ?? [];
    if (channelIds.length > 0) {
      conditions.push(`${alias}.channel_id IN (${placeholders(channelIds.length)})`);
      params.push(...channelIds);
    }

    return {
      clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  findAll(filter: VideoFilter = {}): Video[] {
    const { clause, params } = this.buildWhere(filter, 'v');
    const limit = filter.limit ?? 500;

    const rows = this.db
      .prepare(`SELECT v.* FROM videos v ${clause} ORDER BY v.published_at LIMIT ${limit}`)
      .all(...(params as never[])) as unknown as VideoRow[];

    return rows.map(toDomain);
  }

  findAllWithChannel(filter: VideoFilter = {}): VideoView[] {
    const { clause, params } = this.buildWhere(filter, 'v');
    const limit = filter.limit ?? 500;

    const rows = this.db
      .prepare(
        `SELECT v.*, c.name AS channel_name, c.color AS channel_color
           FROM videos v
           JOIN channels c ON c.id = v.channel_id
           ${clause}
          ORDER BY v.published_at DESC
          LIMIT ${limit}`,
      )
      .all(...(params as never[])) as unknown as VideoViewRow[];

    return rows.map((row) => ({
      ...toDomain(row),
      channelName: row.channel_name,
      channelColor: row.channel_color,
    }));
  }

  findById(id: string): Video | null {
    const row = this.db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as
      VideoRow | undefined;
    return row ? toDomain(row) : null;
  }

  upsertMany(videos: UpsertVideoInput[]): number {
    if (videos.length === 0) return 0;
    const now = new Date().toISOString();

    // Le titre et la miniature changent après coup : on les rafraîchit, jamais la date,
    // et surtout jamais les compteurs — ils ont leur propre écriture (`upsertStats`).
    const stmt = this.db.prepare(
      `INSERT INTO videos
         (id, channel_id, external_id, title, published_at, date, thumbnail_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(channel_id, external_id) DO UPDATE SET
         title = excluded.title,
         published_at = excluded.published_at,
         date = excluded.date,
         thumbnail_url = excluded.thumbnail_url,
         updated_at = excluded.updated_at`,
    );

    let count = 0;
    for (const video of videos) {
      stmt.run(
        newId(),
        video.channelId,
        video.externalId,
        video.title,
        video.publishedAt,
        video.date,
        video.thumbnailUrl,
        now,
        now,
      );
      count += 1;
    }
    return count;
  }

  /**
   * Écrase les compteurs des vidéos concernées.
   *
   * Aucune insertion : une statistique sans ligne de vidéo n'a nulle part où aller, et
   * la vidéo est toujours enregistrée avant par `upsertMany`. Une vidéo absente du lot
   * garde donc ses valeurs précédentes plutôt que de retomber à zéro.
   */
  upsertStats(updates: VideoStatsUpdate[]): number {
    if (updates.length === 0) return 0;
    const now = new Date().toISOString();

    const stmt = this.db.prepare(
      `UPDATE videos
          SET views = ?,
              watch_minutes = ?,
              subscribers_gained = ?,
              likes = ?,
              comments = ?,
              estimated_revenue_cents = ?,
              stats_updated_at = ?,
              updated_at = ?
        WHERE channel_id = ? AND external_id = ?`,
    );

    let count = 0;
    for (const update of updates) {
      const result = stmt.run(
        update.stats.views,
        update.stats.watchMinutes,
        update.stats.subscribersGained,
        update.stats.likes,
        update.stats.comments,
        update.stats.estimatedRevenueCents,
        now,
        now,
        update.channelId,
        update.externalId,
      );
      count += Number(result.changes);
    }
    return count;
  }

  countInRange(channelIds: string[], range: DateRange): number {
    const { clause, params } = this.buildWhere({ channelIds, range }, 'v');
    return (
      this.db
        .prepare(`SELECT COUNT(*) AS n FROM videos v ${clause}`)
        .get(...(params as never[])) as {
        n: number;
      }
    ).n;
  }

  findLatestDate(channelId: string): IsoDate | null {
    const row = this.db
      .prepare('SELECT MAX(date) AS d FROM videos WHERE channel_id = ?')
      .get(channelId) as { d: string | null } | undefined;
    return row?.d ?? null;
  }

  countByChannel(channelId: string): number {
    return (
      this.db.prepare('SELECT COUNT(*) AS n FROM videos WHERE channel_id = ?').get(channelId) as {
        n: number;
      }
    ).n;
  }
}
