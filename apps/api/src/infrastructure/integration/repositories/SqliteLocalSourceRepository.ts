import type { DatabaseSync } from 'node:sqlite';
import type {
  InstagramExport,
  YouTubeExport,
  YouTubePeriodExport,
} from '../../../domain/integration/entities/ExportData.ts';
import type { LocalSourceRepository } from '../../../domain/integration/repositories/IntegrationRepository.ts';
import { round2 } from '../../../domain/integration/services/localeNumber.ts';
import { addDays } from '../../../shared/dates.ts';

interface PeriodRow {
  views: number;
  watch_minutes: number;
  weighted_duration: number;
  subscribers_gained: number;
  subscribers_lost: number;
  likes: number;
  comments: number;
  shares: number;
  revenue_cents: number;
}

interface ChannelRow {
  name: string;
  subscribers: number | null;
  total_views: number | null;
  total_videos: number | null;
  captured_at: string | null;
}

interface VideoRow {
  external_id: string;
  title: string;
  thumbnail_url: string | null;
  published_at: string;
  views: number;
  likes: number;
  comments: number;
  stats_updated_at: string | null;
  channel_name: string;
}

interface InstagramRow {
  username: string;
  last_collected_at: string | null;
  followers_count: number | null;
  follows_count: number | null;
  media_count: number | null;
}

/**
 * Ce que l'export tire de ce que le studio collecte déjà : YouTube et Instagram.
 *
 * **Calculé à la lecture, jamais figé** : les deux sources sont déjà en base, et une
 * collecte déclenchée à la main depuis le dashboard doit se voir dans l'export sans
 * attendre le passage horaire suivant.
 *
 * Mêmes règles que le reste de l'outil : les chaînes et comptes **archivés** sont
 * exclus, `daily_metrics` est un FLUX qui se somme, `channel_snapshots` un CUMUL dont
 * on prend le dernier relevé de chaque chaîne avant de sommer.
 */
export class SqliteLocalSourceRepository implements LocalSourceRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  youtube(today: string): YouTubeExport | null {
    const channels = this.db
      .prepare(
        `SELECT c.name, s.subscribers, s.total_views, s.total_videos, s.captured_at
         FROM channels c
         LEFT JOIN channel_snapshots s ON s.channel_id = c.id
           AND s.date = (SELECT MAX(date) FROM channel_snapshots WHERE channel_id = c.id)
         WHERE c.is_archived = 0
         ORDER BY c.name`,
      )
      .all() as unknown as ChannelRow[];
    if (channels.length === 0) return null;

    const sum = (pick: (row: ChannelRow) => number | null) =>
      channels.reduce((total, row) => total + (pick(row) ?? 0), 0);
    const lastUpdate = channels
      .map((row) => row.captured_at)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1);

    const video = this.db
      .prepare(
        `SELECT v.external_id, v.title, v.thumbnail_url, v.published_at, v.views, v.likes,
                v.comments, v.stats_updated_at, c.name AS channel_name
         FROM videos v
         JOIN channels c ON c.id = v.channel_id
         WHERE v.deleted_at IS NULL AND c.is_archived = 0
         ORDER BY v.published_at DESC
         LIMIT 1`,
      )
      .get() as VideoRow | undefined;

    return {
      lastUpdate: lastUpdate ?? null,
      total: {
        subscribers: sum((row) => row.subscribers),
        views: sum((row) => row.total_views),
        videos: sum((row) => row.total_videos),
      },
      // Le mois civil en cours, et 30 jours glissants aujourd'hui compris. Le jour est
      // celui du serveur (UTC) : aucun navigateur n'est là pour dire l'heure locale, et
      // un décalage de deux heures en bord de mois ne change rien à ce qu'on lit.
      thisMonth: this.period(`${today.slice(0, 8)}01`, today),
      last30days: this.period(addDays(today, -29), today),
      lastVideo: video
        ? {
            title: video.title,
            url: `https://www.youtube.com/watch?v=${video.external_id}`,
            thumbnail: video.thumbnail_url ?? '',
            publishedAt: video.published_at,
            channelName: video.channel_name,
            stats:
              video.stats_updated_at === null
                ? null
                : { viewCount: video.views, likeCount: video.likes, commentCount: video.comments },
          }
        : null,
      channels: channels.map((row) => ({ name: row.name, subscribers: row.subscribers ?? 0 })),
    };
  }

  private period(from: string, to: string): YouTubePeriodExport {
    const row = this.db
      .prepare(
        `SELECT COALESCE(SUM(m.views), 0)                               AS views,
                COALESCE(SUM(m.watch_minutes), 0)                       AS watch_minutes,
                COALESCE(SUM(m.average_view_duration_sec * m.views), 0) AS weighted_duration,
                COALESCE(SUM(m.subscribers_gained), 0)                  AS subscribers_gained,
                COALESCE(SUM(m.subscribers_lost), 0)                    AS subscribers_lost,
                COALESCE(SUM(m.likes), 0)                               AS likes,
                COALESCE(SUM(m.comments), 0)                            AS comments,
                COALESCE(SUM(m.shares), 0)                              AS shares,
                COALESCE(SUM(m.estimated_revenue_cents), 0)             AS revenue_cents
         FROM daily_metrics m
         JOIN channels c ON c.id = m.channel_id
         WHERE c.is_archived = 0 AND m.date BETWEEN ? AND ?`,
      )
      .get(from, to) as unknown as PeriodRow;

    return {
      from,
      to,
      views: row.views,
      estimatedHoursWatched: round2(row.watch_minutes / 60),
      // Une moyenne de moyennes serait fausse : un jour à 10 vues pèserait autant qu'un
      // jour à 10 000. On pondère par les vues, en minutes comme l'ancien export.
      averageViewDuration: row.views > 0 ? round2(row.weighted_duration / row.views / 60) : 0,
      subscribersGained: row.subscribers_gained,
      subscribersLost: row.subscribers_lost,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      estimatedRevenue: round2(row.revenue_cents / 100),
    };
  }

  instagram(): InstagramExport | null {
    const rows = this.db
      .prepare(
        `SELECT a.username, a.last_collected_at, s.followers_count, s.follows_count, s.media_count
         FROM ig_accounts a
         LEFT JOIN ig_account_snapshots s ON s.account_id = a.id
           AND s.date = (SELECT MAX(date) FROM ig_account_snapshots WHERE account_id = a.id)
         WHERE a.is_archived = 0
         ORDER BY a.created_at`,
      )
      .all() as unknown as InstagramRow[];
    if (rows.length === 0) return null;

    const accounts = rows.map((row) => ({
      username: row.username,
      followers: row.followers_count ?? 0,
      following: row.follows_count ?? 0,
      posts: row.media_count ?? 0,
    }));
    const lastUpdate = rows
      .map((row) => row.last_collected_at)
      .filter((value): value is string => value !== null)
      .sort()
      .at(-1);

    return {
      lastUpdate: lastUpdate ?? null,
      username: rows[0]!.username,
      followers: accounts.reduce((total, account) => total + account.followers, 0),
      following: accounts.reduce((total, account) => total + account.following, 0),
      posts: accounts.reduce((total, account) => total + account.posts, 0),
      accounts,
    };
  }
}
