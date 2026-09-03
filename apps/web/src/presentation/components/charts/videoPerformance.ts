import type { VideoPerformanceRow } from '../../../domain/analytics/entities/Analytics.ts';
import {
  grossRevenue,
  netProfit,
  type MoneyOptions,
} from '../../../domain/analytics/services/revenueMath.ts';

/**
 * Une ligne de performance augmentée de ses deux montants composés.
 *
 * Le calcul vit ici plutôt que dans chacun des deux composants (les barres et le
 * tableau) : ils doivent afficher exactement le même total pour la même vidéo. La
 * règle elle-même reste dans `revenueMath`, seul endroit où CA et bénéfice sont définis.
 */
export interface VideoRow extends VideoPerformanceRow {
  /** CA de la vidéo : AdSense + revenus liés, avantages en nature si la case est cochée. */
  revenueCents: number;
  /** Bénéfice = CA − dépenses rattachées à la vidéo. */
  profitCents: number;
  /** Ce que retient l'interrupteur CA / Bénéfices, pour le classement en barres. */
  moneyCents: number;
}

export interface VideoTotals {
  views: number;
  /** Somme des vues de période **mesurables** : les `null` n'entrent pas dans le total. */
  periodViews: number;
  subscribersGained: number;
  adsenseCents: number;
  manualCashCents: number;
  inKindCents: number;
  revenueCents: number;
  expenseCents: number;
  profitCents: number;
  moneyCents: number;
}

export const withMoney = (rows: VideoPerformanceRow[], options: MoneyOptions): VideoRow[] =>
  rows.map((row) => {
    const revenueCents = grossRevenue(row, options.includeInKind);
    const profitCents = netProfit(row, options.includeInKind);
    return {
      ...row,
      revenueCents,
      profitCents,
      moneyCents: options.mode === 'profit' ? profitCents : revenueCents,
    };
  });

export const sumVideoRows = (rows: VideoRow[]): VideoTotals =>
  rows.reduce<VideoTotals>(
    (sum, row) => ({
      views: sum.views + row.views,
      periodViews: sum.periodViews + (row.periodViews ?? 0),
      subscribersGained: sum.subscribersGained + row.subscribersGained,
      adsenseCents: sum.adsenseCents + row.adsenseCents,
      manualCashCents: sum.manualCashCents + row.manualCashCents,
      inKindCents: sum.inKindCents + row.inKindCents,
      revenueCents: sum.revenueCents + row.revenueCents,
      expenseCents: sum.expenseCents + row.expenseCents,
      profitCents: sum.profitCents + row.profitCents,
      moneyCents: sum.moneyCents + row.moneyCents,
    }),
    {
      views: 0,
      periodViews: 0,
      subscribersGained: 0,
      adsenseCents: 0,
      manualCashCents: 0,
      inKindCents: 0,
      revenueCents: 0,
      expenseCents: 0,
      profitCents: 0,
      moneyCents: 0,
    },
  );
