import type { DatabaseSync } from 'node:sqlite';
import type {
  InstagramDailyMetric,
  InstagramSnapshot,
} from '../../../domain/instagram/entities/InstagramAccount.ts';
import type {
  InstagramMedia,
  InstagramStory,
  MediaInsightsInput,
  StoryInsightsInput,
  UpsertMediaInput,
  UpsertStoryInput,
} from '../../../domain/instagram/entities/InstagramStory.ts';
import type {
  InstagramDataFilter,
  InstagramDataRepository,
} from '../../../domain/instagram/repositories/InstagramRepository.ts';
import { placeholders } from '../../db/filters.ts';
import type { IsoDate } from '../../../shared/dates.ts';
import { newId } from '../../../shared/id.ts';

interface StoryRow {
  id: string;
  account_id: string;
  ig_media_id: string;
  media_type: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  posted_at: string;
  date: string;
  views: number | null;
  reach: number | null;
  replies: number | null;
  insights_at: string | null;
  created_at: string;
  updated_at: string;
}

interface MediaRow extends Omit<StoryRow, 'replies' | 'insights_at'> {
  caption: string | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
  stats_at: string | null;
}

const toStory = (row: StoryRow): InstagramStory => ({
  id: row.id,
  accountId: row.account_id,
  igMediaId: row.ig_media_id,
  mediaType: row.media_type,
  permalink: row.permalink,
  thumbnailUrl: row.thumbnail_url,
  postedAt: row.posted_at,
  date: row.date,
  views: row.views,
  reach: row.reach,
  replies: row.replies,
  insightsAt: row.insights_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toMedia = (row: MediaRow): InstagramMedia => ({
  id: row.id,
  accountId: row.account_id,
  igMediaId: row.ig_media_id,
  mediaType: row.media_type,
  caption: row.caption,
  permalink: row.permalink,
  thumbnailUrl: row.thumbnail_url,
  postedAt: row.posted_at,
  date: row.date,
  views: row.views,
  reach: row.reach,
  likes: row.likes,
  comments: row.comments,
  saved: row.saved,
  shares: row.shares,
  statsAt: row.stats_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Ce qui a été archivé d'Instagram : relevés du compte, compteurs quotidiens, stories,
 * publications.
 *
 * Un seul dépôt pour les quatre tables : elles ne se lisent jamais séparément — l'écran
 * a besoin du comptage de stories, des relevés d'abonnés et des flux dans la même
 * réponse, et les séparer imposerait quatre allers-retours pour dessiner une courbe.
 * Même parti pris que `SqliteTodoRepository`.
 */
export class SqliteInstagramDataRepository implements InstagramDataRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /** Clause `WHERE` commune. L'absence de comptes ne filtre rien : vue cumulée. */
  private where(filter: InstagramDataFilter, alias: string): { clause: string; params: unknown[] } {
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

    return {
      clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  // --- Relevés du compte ----------------------------------------------------

  upsertSnapshot(input: InstagramSnapshot): void {
    this.db
      .prepare(
        `INSERT INTO ig_account_snapshots
           (account_id, date, followers_count, follows_count, media_count, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, date) DO UPDATE SET
           followers_count = excluded.followers_count,
           follows_count   = excluded.follows_count,
           media_count     = excluded.media_count`,
      )
      .run(
        input.accountId,
        input.date,
        input.followersCount,
        input.followsCount,
        input.mediaCount,
        new Date().toISOString(),
      );
  }

  findSnapshots(filter: InstagramDataFilter): InstagramSnapshot[] {
    const { clause, params } = this.where(filter, 's');
    const rows = this.db
      .prepare(`SELECT s.* FROM ig_account_snapshots s ${clause} ORDER BY s.date`)
      .all(...(params as never[])) as unknown as Array<{
      account_id: string;
      date: string;
      followers_count: number | null;
      follows_count: number | null;
      media_count: number | null;
    }>;

    return rows.map((row) => ({
      accountId: row.account_id,
      date: row.date,
      followersCount: row.followers_count,
      followsCount: row.follows_count,
      mediaCount: row.media_count,
    }));
  }

  /**
   * Dernier relevé **antérieur** à une date, un par compte.
   *
   * C'est lui qui donne le gain d'abonnés d'une période : sans point de départ, on ne
   * saurait dire si les 1 200 abonnés d'aujourd'hui sont un gain de 10 ou de 400.
   */
  findSnapshotBefore(accountIds: string[], date: IsoDate): InstagramSnapshot[] {
    const conditions = ['s.date < ?'];
    const params: unknown[] = [date];
    if (accountIds.length > 0) {
      conditions.push(`s.account_id IN (${placeholders(accountIds.length)})`);
      params.push(...accountIds);
    }

    const rows = this.db
      .prepare(
        `SELECT s.* FROM ig_account_snapshots s
          WHERE ${conditions.join(' AND ')}
            AND s.date = (SELECT MAX(date) FROM ig_account_snapshots
                           WHERE account_id = s.account_id AND date < ?)`,
      )
      .all(...([...params, date] as never[])) as unknown as Array<{
      account_id: string;
      date: string;
      followers_count: number | null;
      follows_count: number | null;
      media_count: number | null;
    }>;

    return rows.map((row) => ({
      accountId: row.account_id,
      date: row.date,
      followersCount: row.followers_count,
      followsCount: row.follows_count,
      mediaCount: row.media_count,
    }));
  }

  // --- Compteurs quotidiens -------------------------------------------------

  /**
   * Écrit un jour de flux, en **ne remplaçant que ce qu'on sait**.
   *
   * `COALESCE(excluded.x, x)` : une métrique refusée par Meta arrive à `null`, et un
   * `null` ne doit pas effacer une valeur obtenue lors d'un passage précédent — sinon
   * une collecte partielle détruirait ce qu'une collecte complète avait ramené.
   */
  upsertDailyMetric(input: InstagramDailyMetric): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO ig_daily_metrics
           (account_id, date, reach, views, total_interactions, accounts_engaged,
            profile_links_taps, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, date) DO UPDATE SET
           reach              = COALESCE(excluded.reach, reach),
           views              = COALESCE(excluded.views, views),
           total_interactions = COALESCE(excluded.total_interactions, total_interactions),
           accounts_engaged   = COALESCE(excluded.accounts_engaged, accounts_engaged),
           profile_links_taps = COALESCE(excluded.profile_links_taps, profile_links_taps),
           updated_at         = excluded.updated_at`,
      )
      .run(
        input.accountId,
        input.date,
        input.reach,
        input.views,
        input.totalInteractions,
        input.accountsEngaged,
        input.profileLinksTaps,
        now,
        now,
      );
  }

  findDailyMetrics(filter: InstagramDataFilter): InstagramDailyMetric[] {
    const { clause, params } = this.where(filter, 'm');
    const rows = this.db
      .prepare(`SELECT m.* FROM ig_daily_metrics m ${clause} ORDER BY m.date`)
      .all(...(params as never[])) as unknown as Array<{
      account_id: string;
      date: string;
      reach: number | null;
      views: number | null;
      total_interactions: number | null;
      accounts_engaged: number | null;
      profile_links_taps: number | null;
    }>;

    return rows.map((row) => ({
      accountId: row.account_id,
      date: row.date,
      reach: row.reach,
      views: row.views,
      totalInteractions: row.total_interactions,
      accountsEngaged: row.accounts_engaged,
      profileLinksTaps: row.profile_links_taps,
    }));
  }

  findLastMetricDate(accountId: string): IsoDate | null {
    const row = this.db
      .prepare('SELECT MAX(date) AS d FROM ig_daily_metrics WHERE account_id = ?')
      .get(accountId) as { d: string | null };
    return row.d;
  }

  // --- Stories --------------------------------------------------------------

  /**
   * Insère la story si elle est nouvelle, **sans jamais écraser** ce qu'on sait déjà.
   *
   * Une story attrapée dans sa fenêtre de 24 h est une ligne définitive : aucune collecte
   * ultérieure ne pourra la revoir, donc aucune ne peut l'améliorer. `DO NOTHING` protège
   * ce qui a été mesuré d'une réponse partielle qui viendrait le remplacer par du vide.
   */
  upsertStory(input: UpsertStoryInput): InstagramStory {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO ig_stories
           (id, account_id, ig_media_id, media_type, permalink, thumbnail_url,
            posted_at, date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, ig_media_id) DO NOTHING`,
      )
      .run(
        newId(),
        input.accountId,
        input.igMediaId,
        input.mediaType,
        input.permalink,
        input.thumbnailUrl,
        input.postedAt,
        input.date,
        now,
        now,
      );

    return toStory(
      this.db
        .prepare('SELECT * FROM ig_stories WHERE account_id = ? AND ig_media_id = ?')
        .get(input.accountId, input.igMediaId) as unknown as StoryRow,
    );
  }

  setStoryInsights(id: string, insights: StoryInsightsInput): void {
    this.db
      .prepare(
        `UPDATE ig_stories
            SET views = COALESCE(?, views),
                reach = COALESCE(?, reach),
                replies = COALESCE(?, replies),
                insights_at = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(
        insights.views,
        insights.reach,
        insights.replies,
        new Date().toISOString(),
        new Date().toISOString(),
        id,
      );
  }

  findStories(filter: InstagramDataFilter): InstagramStory[] {
    const { clause, params } = this.where(filter, 's');
    const limit = filter.limit ? `LIMIT ${Math.max(1, Math.floor(filter.limit))}` : '';
    const rows = this.db
      .prepare(`SELECT s.* FROM ig_stories s ${clause} ORDER BY s.posted_at DESC ${limit}`)
      .all(...(params as never[])) as unknown as StoryRow[];
    return rows.map(toStory);
  }

  countStoriesByDate(filter: InstagramDataFilter): Map<IsoDate, number> {
    const { clause, params } = this.where(filter, 's');
    const rows = this.db
      .prepare(`SELECT s.date AS date, COUNT(*) AS n FROM ig_stories s ${clause} GROUP BY s.date`)
      .all(...(params as never[])) as unknown as Array<{ date: string; n: number }>;

    const result = new Map<IsoDate, number>();
    for (const row of rows) result.set(row.date, row.n);
    return result;
  }

  findFirstStoryDate(accountIds: string[]): IsoDate | null {
    const clause =
      accountIds.length > 0 ? `WHERE account_id IN (${placeholders(accountIds.length)})` : '';
    const row = this.db
      .prepare(`SELECT MIN(date) AS d FROM ig_stories ${clause}`)
      .get(...(accountIds as never[])) as { d: string | null };
    return row.d;
  }

  // --- Publications ---------------------------------------------------------

  /**
   * Insère la publication, et **met à jour ce qui peut légitimement changer** : une
   * légende se corrige, une miniature se régénère. Les compteurs, eux, passent par
   * `setMediaInsights` — les mélanger ferait effacer des stats par un simple rafraîchissement
   * de la liste.
   */
  upsertMedia(input: UpsertMediaInput): InstagramMedia {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO ig_media
           (id, account_id, ig_media_id, media_type, caption, permalink, thumbnail_url,
            posted_at, date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(account_id, ig_media_id) DO UPDATE SET
           caption       = excluded.caption,
           permalink     = excluded.permalink,
           thumbnail_url = COALESCE(excluded.thumbnail_url, thumbnail_url),
           updated_at    = excluded.updated_at`,
      )
      .run(
        newId(),
        input.accountId,
        input.igMediaId,
        input.mediaType,
        input.caption,
        input.permalink,
        input.thumbnailUrl,
        input.postedAt,
        input.date,
        now,
        now,
      );

    return toMedia(
      this.db
        .prepare('SELECT * FROM ig_media WHERE account_id = ? AND ig_media_id = ?')
        .get(input.accountId, input.igMediaId) as unknown as MediaRow,
    );
  }

  setMediaInsights(id: string, insights: MediaInsightsInput): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE ig_media
            SET views = COALESCE(?, views),
                reach = COALESCE(?, reach),
                likes = COALESCE(?, likes),
                comments = COALESCE(?, comments),
                saved = COALESCE(?, saved),
                shares = COALESCE(?, shares),
                stats_at = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(
        insights.views,
        insights.reach,
        insights.likes,
        insights.comments,
        insights.saved,
        insights.shares,
        now,
        now,
        id,
      );
  }

  findMedia(filter: InstagramDataFilter): InstagramMedia[] {
    const { clause, params } = this.where(filter, 'm');
    const limit = filter.limit ? `LIMIT ${Math.max(1, Math.floor(filter.limit))}` : '';
    const rows = this.db
      .prepare(`SELECT m.* FROM ig_media m ${clause} ORDER BY m.posted_at DESC ${limit}`)
      .all(...(params as never[])) as unknown as MediaRow[];
    return rows.map(toMedia);
  }

  countMediaByDate(filter: InstagramDataFilter): Map<IsoDate, number> {
    const { clause, params } = this.where(filter, 'm');
    const rows = this.db
      .prepare(`SELECT m.date AS date, COUNT(*) AS n FROM ig_media m ${clause} GROUP BY m.date`)
      .all(...(params as never[])) as unknown as Array<{ date: string; n: number }>;

    const result = new Map<IsoDate, number>();
    for (const row of rows) result.set(row.date, row.n);
    return result;
  }

  findMediaToRefresh(accountId: string, since: IsoDate): InstagramMedia[] {
    const rows = this.db
      .prepare(`SELECT * FROM ig_media WHERE account_id = ? AND date >= ? ORDER BY posted_at DESC`)
      .all(accountId, since) as unknown as MediaRow[];
    return rows.map(toMedia);
  }
}
