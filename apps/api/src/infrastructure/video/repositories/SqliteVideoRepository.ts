import type { DatabaseSync } from 'node:sqlite';
import type { IsoDate } from '../../../shared/dates.ts';
import type { DateRange } from '../../../domain/metrics/repositories/MetricsRepository.ts';
import type {
  UpsertVideoInput,
  Video,
  VideoRangeStats,
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
   * Écrase les compteurs des vidéos concernées, **et en garde une trace datée**.
   *
   * Aucune insertion dans `videos` : une statistique sans ligne de vidéo n'a nulle part
   * où aller, et la vidéo est toujours enregistrée avant par `upsertMany`. Une vidéo
   * absente du lot garde donc ses valeurs précédentes plutôt que de retomber à zéro.
   *
   * Le relevé du jour (`video_stat_snapshots`) est écrit dans la foulée : les compteurs
   * de `videos` sont des cumuls écrasés à chaque passage, et sans point de repère daté
   * on ne saurait jamais dire ce qu'une vidéo a rapporté *sur une période*. Un seul
   * relevé par jour, le dernier écrasant le précédent — la collecte tourne toutes les
   * heures, et douze lignes par jour et par vidéo ne diraient rien de plus.
   */
  upsertStats(updates: VideoStatsUpdate[]): number {
    if (updates.length === 0) return 0;
    const now = new Date().toISOString();
    const today = now.slice(0, 10);

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

    const snapshot = this.db.prepare(
      `INSERT INTO video_stat_snapshots
         (video_id, date, views, watch_minutes, subscribers_gained, likes, comments,
          estimated_revenue_cents, captured_at)
       SELECT v.id, ?, ?, ?, ?, ?, ?, ?, ?
         FROM videos v
        WHERE v.channel_id = ? AND v.external_id = ?
       ON CONFLICT(video_id, date) DO UPDATE SET
         views = excluded.views,
         watch_minutes = excluded.watch_minutes,
         subscribers_gained = excluded.subscribers_gained,
         likes = excluded.likes,
         comments = excluded.comments,
         estimated_revenue_cents = excluded.estimated_revenue_cents,
         captured_at = excluded.captured_at`,
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

      snapshot.run(
        today,
        update.stats.views,
        update.stats.watchMinutes,
        update.stats.subscribersGained,
        update.stats.likes,
        update.stats.comments,
        update.stats.estimatedRevenueCents,
        now,
        update.channelId,
        update.externalId,
      );
    }
    return count;
  }

  /**
   * Ce que des vidéos ont fait **sur une période**, par différence de relevés.
   *
   * Pour chaque vidéo : dernier relevé jusqu'à `to`, moins dernier relevé antérieur à
   * `from`. Une vidéo sans relevé antérieur est **absente du résultat** plutôt que
   * ramenée à son cumul : sur une vidéo sortie il y a deux ans, afficher 40 000 vues
   * dans une colonne « sur la période » serait faux d'un facteur cinquante.
   *
   * L'écart est planché à zéro : YouTube révise ses chiffres à la baisse (vues
   * invalidées), et une période ne doit pas afficher −12 vues.
   */
  sumStatsOverRange(videoIds: string[], range: DateRange): Map<string, VideoRangeStats> {
    const result = new Map<string, VideoRangeStats>();
    if (videoIds.length === 0) return result;

    const holes = placeholders(videoIds.length);
    // Deux photos du catalogue : celle de la fin de période, et celle d'avant son début.
    // `MAX(date)` par vidéo donne le relevé le plus récent de chaque côté.
    const rows = this.db
      .prepare(
        `WITH bounds AS (
           SELECT s.video_id,
                  MAX(CASE WHEN s.date <= ? THEN s.date END) AS end_date,
                  MAX(CASE WHEN s.date <  ? THEN s.date END) AS start_date
             FROM video_stat_snapshots s
            WHERE s.video_id IN (${holes})
            GROUP BY s.video_id
         )
         SELECT b.video_id                                            AS video_id,
                e.views - COALESCE(o.views, 0)                        AS views,
                e.watch_minutes - COALESCE(o.watch_minutes, 0)        AS watch_minutes,
                e.subscribers_gained - COALESCE(o.subscribers_gained, 0) AS subscribers_gained,
                e.estimated_revenue_cents - COALESCE(o.estimated_revenue_cents, 0)
                                                                      AS revenue_cents,
                o.video_id IS NOT NULL                                AS has_baseline
           FROM bounds b
           JOIN video_stat_snapshots e
             ON e.video_id = b.video_id AND e.date = b.end_date
           LEFT JOIN video_stat_snapshots o
             ON o.video_id = b.video_id AND o.date = b.start_date
          WHERE b.end_date IS NOT NULL`,
      )
      .all(range.to, range.from, ...(videoIds as never[])) as unknown as Array<{
      video_id: string;
      views: number;
      watch_minutes: number;
      subscribers_gained: number;
      revenue_cents: number;
      has_baseline: number;
    }>;

    for (const row of rows) {
      // Sans relevé antérieur, on ne sait pas séparer ce qui vient de la période du
      // cumul d'avant : la vidéo n'a pas de valeur, et le tableau affichera « — ».
      if (row.has_baseline !== 1) continue;
      result.set(row.video_id, {
        views: Math.max(0, row.views),
        watchMinutes: Math.max(0, row.watch_minutes),
        subscribersGained: Math.max(0, row.subscribers_gained),
        estimatedRevenueCents: Math.max(0, row.revenue_cents),
      });
    }

    return result;
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
