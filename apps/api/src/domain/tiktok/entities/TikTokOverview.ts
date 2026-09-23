import type { Granularity, IsoDate } from '../../../shared/dates.ts';
import type { TikTokAccountView, TikTokVideo } from './TikTokAccount.ts';

/**
 * Même découpage FLUX / CUMUL que les autres séries du studio : `videos` se compte dans
 * le bucket et entre comptes ; `followers` et `hearts` sont des cumuls dont on garde la
 * dernière valeur connue, reportée sur les buckets sans relevé — même mécanique que
 * `InstagramSeriesPoint`.
 */
export interface TikTokSeriesPoint {
  date: IsoDate;
  videos: number;
  followers: number | null;
  followersGained: number | null;
  hearts: number | null;
}

export interface TikTokTotals {
  videos: number;
  followers: number | null;
  followersGained: number | null;
  hearts: number | null;
  days: number;
}

export interface TikTokOverview {
  from: IsoDate;
  to: IsoDate;
  granularity: Granularity;
  accounts: TikTokAccountView[];
  series: TikTokSeriesPoint[];
  totals: TikTokTotals;
  previousTotals: TikTokTotals;
  videos: TikTokVideo[];
}
