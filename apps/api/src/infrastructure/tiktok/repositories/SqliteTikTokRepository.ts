import type { DatabaseSync } from 'node:sqlite';
import {
  DEFAULT_TIKTOK_COLORS,
  type TikTokAccount,
  type TikTokAccountView,
  type TikTokSnapshot,
  type TikTokVideo,
  type UpdateTikTokAccountInput,
} from '../../../domain/tiktok/entities/TikTokAccount.ts';
import type {
  TikTokAccountRepository,
  TikTokDataFilter,
  TikTokDataRepository,
  UpsertTikTokVideoInput,
} from '../../../domain/tiktok/repositories/TikTokRepository.ts';
import { placeholders } from '../../db/filters.ts';
import type { IsoDate } from '../../../shared/dates.ts';
import { newId } from '../../../shared/id.ts';
import { conflict, notFound } from '../../../shared/errors.ts';

interface AccountRow {
  id: string;
  username: string;
  name: string | null;
  profile_picture: string | null;
  color: string;
  is_archived: number;
  export_enabled: number;
  last_collected_at: string | null;
  created_at: string;
  updated_at: string;
}

interface VideoRow {
  id: string;
  account_id: string;
  video_id: string;
  description: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  posted_at: string;
  date: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  stats_at: string | null;
}

const toAccount = (row: AccountRow): TikTokAccount => ({
  id: row.id,
  username: row.username,
  name: row.name,
  profilePicture: row.profile_picture,
  color: row.color,
  isArchived: row.is_archived === 1,
  exportEnabled: row.export_enabled === 1,
  lastCollectedAt: row.last_collected_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toVideo = (row: VideoRow): TikTokVideo => ({
  id: row.id,
  accountId: row.account_id,
  videoId: row.video_id,
  description: row.description,
  permalink: row.permalink,
  thumbnailUrl: row.thumbnail_url,
  postedAt: row.posted_at,
  date: row.date,
  views: row.views,
  likes: row.likes,
  comments: row.comments,
  shares: row.shares,
  statsAt: row.stats_at,
});

/**
 * Les comptes TikTok suivis par leur profil public, et ce qu'on en a archivé — un seul
 * dépôt pour les trois tables, comme `SqliteInstagramDataRepository` : l'écran a besoin
 * des comptes, des relevés et des vidéos dans la même réponse.
 */
export class SqliteTikTokRepository implements TikTokAccountRepository, TikTokDataRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  // --- Comptes ----------------------------------------------------------------

  findAll(includeArchived = false): TikTokAccountView[] {
    const clause = includeArchived ? '' : 'WHERE is_archived = 0';
    const rows = this.db
      .prepare(`SELECT * FROM tiktok_accounts ${clause} ORDER BY username`)
      .all() as unknown as AccountRow[];

    return rows.map((row) => {
      const account = toAccount(row);
      const snapshot = this.db
        .prepare(
          'SELECT * FROM tiktok_account_snapshots WHERE account_id = ? ORDER BY date DESC LIMIT 1',
        )
        .get(row.id) as
        | {
            account_id: string;
            date: string;
            followers_count: number | null;
            following_count: number | null;
            heart_count: number | null;
            video_count: number | null;
          }
        | undefined;

      return {
        ...account,
        latestSnapshot: snapshot
          ? ({
              accountId: snapshot.account_id,
              date: snapshot.date,
              followersCount: snapshot.followers_count,
              followingCount: snapshot.following_count,
              heartCount: snapshot.heart_count,
              videoCount: snapshot.video_count,
            } satisfies TikTokSnapshot)
          : null,
      };
    });
  }

  findById(id: string): TikTokAccount | null {
    const row = this.db.prepare('SELECT * FROM tiktok_accounts WHERE id = ?').get(id) as
      AccountRow | undefined;
    return row ? toAccount(row) : null;
  }

  findByUsername(username: string): TikTokAccount | null {
    const row = this.db
      .prepare('SELECT * FROM tiktok_accounts WHERE username = ? COLLATE NOCASE')
      .get(username) as AccountRow | undefined;
    return row ? toAccount(row) : null;
  }

  create(input: { username: string; name: string | null }): TikTokAccount {
    if (this.findByUsername(input.username)) {
      throw conflict('Ce compte TikTok est déjà suivi.');
    }

    const id = newId();
    const now = new Date().toISOString();
    const count = (
      this.db.prepare('SELECT COUNT(*) AS n FROM tiktok_accounts').get() as { n: number }
    ).n;

    this.db
      .prepare(
        `INSERT INTO tiktok_accounts (id, username, name, color, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        id,
        input.username,
        input.name,
        DEFAULT_TIKTOK_COLORS[count % DEFAULT_TIKTOK_COLORS.length]!,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateTikTokAccountInput): TikTokAccount {
    const existing = this.findById(id);
    if (!existing) throw notFound('Compte TikTok');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.username !== undefined) set('username', input.username);
    if (input.name !== undefined) set('name', input.name);
    if (input.profilePicture !== undefined) set('profile_picture', input.profilePicture);
    if (input.color !== undefined) set('color', input.color);
    if (input.isArchived !== undefined) set('is_archived', input.isArchived ? 1 : 0);
    if (input.exportEnabled !== undefined) set('export_enabled', input.exportEnabled ? 1 : 0);
    if (input.lastCollectedAt !== undefined) set('last_collected_at', input.lastCollectedAt);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE tiktok_accounts SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  /** Supprime le compte **et tout son historique** (cascade SQL) — même règle qu'Instagram. */
  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM tiktok_accounts WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Compte TikTok');
  }

  // --- Relevés (CUMUL) ---------------------------------------------------------

  private where(filter: TikTokDataFilter, alias: string): { clause: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const ids = filter.accountIds ?? [];
    if (ids.length > 0) {
      conditions.push(`${alias}.account_id IN (${placeholders(ids.length)})`);
      params.push(...ids);
    }
    if (filter.range) {
      conditions.push(`${alias}.date BETWEEN ? AND ?`);
      params.push(filter.range.from, filter.range.to);
    }

    return { clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', params };
  }

  upsertSnapshot(input: TikTokSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO tiktok_account_snapshots
           (account_id, date, followers_count, following_count, heart_count, video_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, date) DO UPDATE SET
           followers_count = excluded.followers_count,
           following_count = excluded.following_count,
           heart_count     = excluded.heart_count,
           video_count     = excluded.video_count`,
      )
      .run(
        input.accountId,
        input.date,
        input.followersCount,
        input.followingCount,
        input.heartCount,
        input.videoCount,
        new Date().toISOString(),
      );
  }

  findSnapshots(filter: TikTokDataFilter): TikTokSnapshot[] {
    const { clause, params } = this.where(filter, 's');
    const rows = this.db
      .prepare(`SELECT s.* FROM tiktok_account_snapshots s ${clause} ORDER BY s.date`)
      .all(...(params as never[])) as unknown as Array<{
      account_id: string;
      date: string;
      followers_count: number | null;
      following_count: number | null;
      heart_count: number | null;
      video_count: number | null;
    }>;

    return rows.map((row) => ({
      accountId: row.account_id,
      date: row.date,
      followersCount: row.followers_count,
      followingCount: row.following_count,
      heartCount: row.heart_count,
      videoCount: row.video_count,
    }));
  }

  findSnapshotBefore(accountIds: string[], date: IsoDate): TikTokSnapshot[] {
    const conditions = ['s.date < ?'];
    const params: unknown[] = [date];
    if (accountIds.length > 0) {
      conditions.push(`s.account_id IN (${placeholders(accountIds.length)})`);
      params.push(...accountIds);
    }

    const rows = this.db
      .prepare(
        `SELECT s.* FROM tiktok_account_snapshots s
          WHERE ${conditions.join(' AND ')}
            AND s.date = (SELECT MAX(date) FROM tiktok_account_snapshots
                           WHERE account_id = s.account_id AND date < ?)`,
      )
      .all(...([...params, date] as never[])) as unknown as Array<{
      account_id: string;
      date: string;
      followers_count: number | null;
      following_count: number | null;
      heart_count: number | null;
      video_count: number | null;
    }>;

    return rows.map((row) => ({
      accountId: row.account_id,
      date: row.date,
      followersCount: row.followers_count,
      followingCount: row.following_count,
      heartCount: row.heart_count,
      videoCount: row.video_count,
    }));
  }

  // --- Vidéos -------------------------------------------------------------------

  /**
   * Écrit la vidéo et ses compteurs d'un bloc : la page publique de TikTok rend tout en une
   * seule lecture, il n'y a pas de second appel d'insights à orchestrer comme sur
   * Instagram. La description et la miniature sont mises à jour à chaque passage ; les
   * compteurs ne reculent jamais silencieusement puisqu'ils sont écrasés par la valeur du
   * jour, qui est la meilleure connue.
   */
  upsertVideo(input: UpsertTikTokVideoInput): TikTokVideo {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO tiktok_videos
           (id, account_id, video_id, description, permalink, thumbnail_url, posted_at, date,
            views, likes, comments, shares, stats_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, video_id) DO UPDATE SET
           description   = excluded.description,
           permalink     = excluded.permalink,
           thumbnail_url = COALESCE(excluded.thumbnail_url, thumbnail_url),
           views         = COALESCE(excluded.views, views),
           likes         = COALESCE(excluded.likes, likes),
           comments      = COALESCE(excluded.comments, comments),
           shares        = COALESCE(excluded.shares, shares),
           stats_at      = excluded.stats_at,
           updated_at    = excluded.updated_at`,
      )
      .run(
        newId(),
        input.accountId,
        input.videoId,
        input.description,
        input.permalink,
        input.thumbnailUrl,
        input.postedAt,
        input.date,
        input.views,
        input.likes,
        input.comments,
        input.shares,
        now,
        now,
        now,
      );

    return toVideo(
      this.db
        .prepare('SELECT * FROM tiktok_videos WHERE account_id = ? AND video_id = ?')
        .get(input.accountId, input.videoId) as unknown as VideoRow,
    );
  }

  findVideos(filter: TikTokDataFilter): TikTokVideo[] {
    const { clause, params } = this.where(filter, 'v');
    const limit = filter.limit ? `LIMIT ${Math.max(1, Math.floor(filter.limit))}` : '';
    const rows = this.db
      .prepare(`SELECT v.* FROM tiktok_videos v ${clause} ORDER BY v.posted_at DESC ${limit}`)
      .all(...(params as never[])) as unknown as VideoRow[];
    return rows.map(toVideo);
  }

  countVideosByDate(filter: TikTokDataFilter): Map<IsoDate, number> {
    const { clause, params } = this.where(filter, 'v');
    const rows = this.db
      .prepare(
        `SELECT v.date AS date, COUNT(*) AS n FROM tiktok_videos v ${clause} GROUP BY v.date`,
      )
      .all(...(params as never[])) as unknown as Array<{ date: string; n: number }>;

    const result = new Map<IsoDate, number>();
    for (const row of rows) result.set(row.date, row.n);
    return result;
  }
}
