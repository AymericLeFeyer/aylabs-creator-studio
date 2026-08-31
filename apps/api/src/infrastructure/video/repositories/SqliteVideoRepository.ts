import type { DatabaseSync } from 'node:sqlite';
import type { IsoDate } from '../../../shared/dates.ts';
import type { UpsertVideoInput, Video } from '../../../domain/video/entities/Video.ts';
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
}

const toDomain = (row: VideoRow): Video => ({
  id: row.id,
  channelId: row.channel_id,
  externalId: row.external_id,
  title: row.title,
  publishedAt: row.published_at,
  date: row.date,
  thumbnailUrl: row.thumbnail_url,
});

export class SqliteVideoRepository implements VideoRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(filter: VideoFilter = {}): Video[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.range) {
      conditions.push('date BETWEEN ? AND ?');
      params.push(filter.range.from, filter.range.to);
    }
    const channelIds = filter.channelIds ?? [];
    if (channelIds.length > 0) {
      conditions.push(`channel_id IN (${placeholders(channelIds.length)})`);
      params.push(...channelIds);
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter.limit ?? 500;

    const rows = this.db
      .prepare(`SELECT * FROM videos ${clause} ORDER BY published_at LIMIT ${limit}`)
      .all(...(params as never[])) as unknown as VideoRow[];

    return rows.map(toDomain);
  }

  upsertMany(videos: UpsertVideoInput[]): number {
    if (videos.length === 0) return 0;
    const now = new Date().toISOString();

    // Le titre et la miniature changent après coup : on les rafraîchit, jamais la date.
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
