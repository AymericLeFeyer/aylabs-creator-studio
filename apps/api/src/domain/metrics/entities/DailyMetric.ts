import type { Cents } from '../../../shared/money.ts';
import type { IsoDate } from '../../../shared/dates.ts';

/**
 * D'où vient la mesure :
 * - `youtube_analytics` : chiffres exacts remontés par l'API Analytics (mode OAuth).
 * - `derived` : déduit de l'écart entre deux snapshots publics. Concerne uniquement les
 *   vues, qui sont exactes dans l'API publique — les abonnés y sont arrondis à 3 chiffres
 *   significatifs au-delà de 1000, donc leurs deltas seraient de faux escaliers.
 * - `manual` : saisi à la main, jamais écrasé par une collecte.
 */
export type MetricSource = 'youtube_analytics' | 'derived' | 'manual';

/**
 * Métriques de FLUX pour une chaîne sur une journée donnée (ce qui s'est passé ce jour-là).
 * C'est la brique des graphiques : additionner des flux entre eux a du sens,
 * contrairement aux totaux cumulés d'un `ChannelSnapshot`.
 */
export interface DailyMetric {
  channelId: string;
  date: IsoDate;
  views: number;
  watchMinutes: number;
  averageViewDurationSec: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
  shares: number;
  /** Revenu AdSense estimé par YouTube Analytics, en centimes. */
  estimatedRevenueCents: Cents;
  source: MetricSource;
}

export const emptyDailyMetric = (channelId: string, date: IsoDate): DailyMetric => ({
  channelId,
  date,
  views: 0,
  watchMinutes: 0,
  averageViewDurationSec: 0,
  subscribersGained: 0,
  subscribersLost: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  estimatedRevenueCents: 0,
  source: 'manual',
});
