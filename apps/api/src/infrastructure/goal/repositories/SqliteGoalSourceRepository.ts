import type { DatabaseSync } from 'node:sqlite';
import type {
  GoalEntity,
  GoalEntityKind,
  GoalMetricId,
  GoalPoint,
} from '../../../domain/goal/entities/Goal.ts';
import type {
  GoalSourceRepository,
  RawGoalSeries,
} from '../../../domain/goal/repositories/GoalSourceRepository.ts';

/** Lectures seules, historique complet, sans période : voir le port. */
export class SqliteGoalSourceRepository implements GoalSourceRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private points(sql: string, ...params: string[]): GoalPoint[] {
    return (this.db.prepare(sql).all(...params) as unknown as GoalPoint[]).filter(
      (row) => row.date && row.value !== null,
    );
  }

  private level(sql: string, ...params: string[]): RawGoalSeries {
    return { kind: 'level', points: this.points(sql, ...params) };
  }

  private flux(sql: string, ...params: string[]): RawGoalSeries {
    return { kind: 'flux', points: this.points(sql, ...params) };
  }

  entities(): Record<GoalEntityKind, GoalEntity[]> {
    const all = (sql: string) => this.db.prepare(sql).all() as unknown as GoalEntity[];
    return {
      youtube: all(
        'SELECT id, name, color FROM channels WHERE is_archived = 0 ORDER BY created_at',
      ),
      instagram: all(
        `SELECT id, '@' || username AS name, color FROM ig_accounts
         WHERE is_archived = 0 ORDER BY created_at`,
      ),
      tiktok: all(
        `SELECT id, '@' || username AS name, color FROM tiktok_accounts
         WHERE is_archived = 0 ORDER BY created_at`,
      ),
    };
  }

  series(metric: GoalMetricId, entityId: string | null): RawGoalSeries {
    const id = entityId ?? '';
    const snapshot = (column: string) =>
      this.level(
        `SELECT date, ${column} AS value FROM channel_snapshots
         WHERE channel_id = ? ORDER BY date`,
        id,
      );
    const daily = (expression: string) =>
      this.flux(
        `SELECT date, ${expression} AS value FROM daily_metrics
         WHERE channel_id = ? ORDER BY date`,
        id,
      );
    const instagram = (column: string) =>
      this.level(
        `SELECT date, ${column} AS value FROM ig_account_snapshots
         WHERE account_id = ? ORDER BY date`,
        id,
      );
    const instagramDaily = (column: string) =>
      this.flux(
        `SELECT date, ${column} AS value FROM ig_daily_metrics
         WHERE account_id = ? ORDER BY date`,
        id,
      );
    const tiktok = (column: string) =>
      this.level(
        `SELECT date, ${column} AS value FROM tiktok_account_snapshots
         WHERE account_id = ? ORDER BY date`,
        id,
      );
    const domadoo = (column: string) =>
      this.level(`SELECT date, ${column} AS value FROM domadoo_snapshots ORDER BY date`);

    switch (metric) {
      case 'youtube.subscribers':
        return snapshot('subscribers');
      case 'youtube.views':
        return snapshot('total_views');
      case 'youtube.videos':
        return snapshot('total_videos');
      case 'youtube.watchHours':
        return daily('watch_minutes / 60.0');
      case 'youtube.likes':
        return daily('likes');
      case 'youtube.comments':
        return daily('comments');
      case 'youtube.shares':
        return daily('shares');
      case 'adsense.revenue':
        return entityId
          ? daily('estimated_revenue_cents')
          : this.flux(
              `SELECT date, SUM(estimated_revenue_cents) AS value FROM daily_metrics
               GROUP BY date ORDER BY date`,
            );
      case 'instagram.followers':
        return instagram('followers_count');
      case 'instagram.posts':
        return instagram('media_count');
      case 'instagram.stories':
        return this.flux(
          `SELECT date, COUNT(*) AS value FROM ig_stories
           WHERE account_id = ? GROUP BY date ORDER BY date`,
          id,
        );
      case 'instagram.reach':
        return instagramDaily('reach');
      case 'instagram.views':
        return instagramDaily('views');
      case 'instagram.interactions':
        return instagramDaily('total_interactions');
      case 'tiktok.followers':
        return tiktok('followers_count');
      case 'tiktok.hearts':
        return tiktok('heart_count');
      case 'tiktok.videos':
        return tiktok('video_count');
      case 'discord.members':
        // Un relevé par collecte : le dernier de chaque jour fait foi.
        return this.level(
          `SELECT substr(fetched_at, 1, 10) AS date, members AS value FROM discord_snapshots
           WHERE id IN (SELECT MAX(id) FROM discord_snapshots GROUP BY substr(fetched_at, 1, 10))
           ORDER BY date`,
        );
      case 'products.count':
      case 'products.value':
        return this.flux(
          `SELECT substr(received_at, 1, 10) AS date,
                  ${metric === 'products.count' ? 'COUNT(*)' : 'SUM(value_cents)'} AS value
           FROM products WHERE status = 'received' AND received_at IS NOT NULL
           GROUP BY 1 ORDER BY 1`,
        );
      case 'sponsorships.count':
      case 'sponsorships.amount':
        return this.flux(
          `SELECT substr(paid_at, 1, 10) AS date,
                  ${metric === 'sponsorships.count' ? 'COUNT(*)' : 'SUM(amount_cents)'} AS value
           FROM sponsorships WHERE status = 'paid' AND paid_at IS NOT NULL
           GROUP BY 1 ORDER BY 1`,
        );
      case 'affiliation.revenue':
        return this.flux(
          `SELECT date, SUM(amount_cents) AS value FROM revenue_entries
           WHERE category_id = 'affiliation' GROUP BY date ORDER BY date`,
        );
      case 'amazon.earnings':
        return this.amazon('earnings_cents');
      case 'amazon.clicks':
        return this.amazon('clicks');
      case 'amazon.ordered':
        return this.amazon('items_ordered');
      case 'domadoo.earnings':
        return domadoo('earnings_cents');
      case 'domadoo.clicks':
        return domadoo('clicks');
      case 'domadoo.sales':
        return domadoo('approved_sales');
      case 'money.revenue':
        return this.money(false, false);
      case 'money.cash':
        return this.money(true, false);
      case 'money.profit':
        return this.money(false, true);
    }
  }

  /**
   * Amazon ne donne que le **cumul du mois**, remis à zéro le 1er : chaque relevé devient
   * l'écart avec le précédent du même mois, et un relevé qui ouvre un mois compte en
   * entier. Plancher à zéro, comme partout : une révision à la baisse n'est pas une perte.
   */
  private amazon(column: string): RawGoalSeries {
    const rows = this.points(`SELECT date, ${column} AS value FROM amazon_snapshots ORDER BY date`);
    const points: GoalPoint[] = [];
    let previous: GoalPoint | null = null;
    for (const row of rows) {
      const sameMonth = previous !== null && previous.date.slice(0, 7) === row.date.slice(0, 7);
      points.push({
        date: row.date,
        value: Math.max(0, sameMonth ? row.value - previous!.value : row.value),
      });
      previous = row;
    }
    return { kind: 'flux', points };
  }

  /**
   * CA = AdSense + revenus saisis (produits reçus compris, sauf `cashOnly`) ; le bénéfice
   * en retire les dépenses. Même règle que `revenueMath`, en un seul flux quotidien.
   */
  private money(cashOnly: boolean, profit: boolean): RawGoalSeries {
    const revenues = this.points(
      `SELECT r.date AS date, SUM(r.amount_cents) AS value
       FROM revenue_entries r JOIN categories c ON c.id = r.category_id
       ${cashOnly ? "WHERE c.nature = 'cash'" : ''}
       GROUP BY r.date`,
    );
    const adsense = this.points(
      `SELECT date, SUM(estimated_revenue_cents) AS value FROM daily_metrics GROUP BY date`,
    );
    const expenses = profit
      ? this.points(`SELECT date, -SUM(amount_cents) AS value FROM expense_entries GROUP BY date`)
      : [];
    return { kind: 'flux', points: [...revenues, ...adsense, ...expenses] };
  }
}
