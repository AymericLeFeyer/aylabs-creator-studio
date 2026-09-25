import type { DatabaseSync } from 'node:sqlite';
import type {
  AchievementEntity,
  AchievementSourceRepository,
  DatedItem,
  YouTubeDailyRow,
  YouTubeSnapshotRow,
} from '../../../domain/achievement/repositories/AchievementSourceRepository.ts';

/** Lectures seules, historique complet, sans période : voir le port. */
export class SqliteAchievementSourceRepository implements AchievementSourceRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private all<T>(sql: string, ...params: string[]): T[] {
    return this.db.prepare(sql).all(...params) as unknown as T[];
  }

  youtubeChannels(): AchievementEntity[] {
    return this.all<AchievementEntity>(
      'SELECT id, name, color FROM channels WHERE is_archived = 0 ORDER BY created_at',
    );
  }

  youtubeDaily(channelId: string): YouTubeDailyRow[] {
    return this.all<{
      date: string;
      views: number;
      watch_minutes: number;
      gained: number;
      lost: number;
      revenue: number;
    }>(
      `SELECT date, views, watch_minutes, subscribers_gained AS gained,
              subscribers_lost AS lost, estimated_revenue_cents AS revenue
       FROM daily_metrics WHERE channel_id = ? ORDER BY date`,
      channelId,
    ).map((row) => ({
      date: row.date,
      views: row.views,
      watchMinutes: row.watch_minutes,
      subscribersNet: row.gained - row.lost,
      hasSubscriberFlux: row.gained !== 0 || row.lost !== 0,
      revenueCents: row.revenue,
    }));
  }

  youtubeSnapshots(channelId: string): YouTubeSnapshotRow[] {
    return this.all<YouTubeSnapshotRow>(
      `SELECT date, subscribers, total_views AS totalViews, total_videos AS totalVideos
       FROM channel_snapshots WHERE channel_id = ? ORDER BY date`,
      channelId,
    );
  }

  youtubeVideos(channelId: string): DatedItem[] {
    return this.all<DatedItem>(
      `SELECT date, title, CASE WHEN stats_updated_at IS NULL THEN NULL ELSE views END AS score
       FROM videos WHERE channel_id = ? AND deleted_at IS NULL ORDER BY published_at`,
      channelId,
    );
  }

  instagramAccounts(): AchievementEntity[] {
    return this.all<AchievementEntity>(
      `SELECT id, '@' || username AS name, color FROM ig_accounts
       WHERE is_archived = 0 ORDER BY created_at`,
    );
  }

  instagramSnapshots(accountId: string) {
    return this.all<{ date: string; followers: number | null; mediaCount: number | null }>(
      `SELECT date, followers_count AS followers, media_count AS mediaCount
       FROM ig_account_snapshots WHERE account_id = ? ORDER BY date`,
      accountId,
    );
  }

  instagramMedia(accountId: string): DatedItem[] {
    return this.all<DatedItem>(
      `SELECT date, caption AS title, likes AS score
       FROM ig_media WHERE account_id = ? ORDER BY posted_at`,
      accountId,
    );
  }

  instagramStoryDates(accountId: string): string[] {
    return this.all<{ date: string }>(
      'SELECT date FROM ig_stories WHERE account_id = ? ORDER BY posted_at',
      accountId,
    ).map((row) => row.date);
  }

  instagramReach(accountId: string) {
    return this.all<{ date: string; reach: number }>(
      `SELECT date, reach FROM ig_daily_metrics
       WHERE account_id = ? AND reach IS NOT NULL ORDER BY date`,
      accountId,
    );
  }

  tiktokAccounts(): AchievementEntity[] {
    return this.all<AchievementEntity>(
      `SELECT id, '@' || username AS name, color FROM tiktok_accounts
       WHERE is_archived = 0 ORDER BY created_at`,
    );
  }

  tiktokSnapshots(accountId: string) {
    return this.all<{ date: string; followers: number | null; hearts: number | null }>(
      `SELECT date, followers_count AS followers, heart_count AS hearts
       FROM tiktok_account_snapshots WHERE account_id = ? ORDER BY date`,
      accountId,
    );
  }

  tiktokVideos(accountId: string): DatedItem[] {
    return this.all<DatedItem>(
      `SELECT date, description AS title, views AS score
       FROM tiktok_videos WHERE account_id = ? ORDER BY posted_at`,
      accountId,
    );
  }
}
