import type { VideoPerformanceRow } from '../../../domain/analytics/entities/Analytics.ts';
import { moneyValue, type MoneyOptions } from '../../../domain/analytics/services/revenueMath.ts';

/**
 * Une ligne de performance augmentée du montant retenu par les réglages d'argent.
 *
 * Le calcul vit ici plutôt que dans chacun des deux composants (les barres et le
 * tableau) : ils doivent afficher exactement le même total pour la même vidéo.
 */
export interface VideoRow extends VideoPerformanceRow {
  moneyCents: number;
}

export interface VideoTotals {
  views: number;
  subscribersGained: number;
  adsenseCents: number;
  manualCashCents: number;
  inKindCents: number;
  expenseCents: number;
  moneyCents: number;
}

export const withMoney = (rows: VideoPerformanceRow[], options: MoneyOptions): VideoRow[] =>
  rows.map((row) => ({ ...row, moneyCents: moneyValue(row, options) }));

export const sumVideoRows = (rows: VideoRow[]): VideoTotals =>
  rows.reduce<VideoTotals>(
    (sum, row) => ({
      views: sum.views + row.views,
      subscribersGained: sum.subscribersGained + row.subscribersGained,
      adsenseCents: sum.adsenseCents + row.adsenseCents,
      manualCashCents: sum.manualCashCents + row.manualCashCents,
      inKindCents: sum.inKindCents + row.inKindCents,
      expenseCents: sum.expenseCents + row.expenseCents,
      moneyCents: sum.moneyCents + row.moneyCents,
    }),
    {
      views: 0,
      subscribersGained: 0,
      adsenseCents: 0,
      manualCashCents: 0,
      inKindCents: 0,
      expenseCents: 0,
      moneyCents: 0,
    },
  );
