import type { Cents } from '../../../shared/money.ts';
import type { AnalyticsTotals, TimeSeriesPoint } from '../entities/TimeSeries.ts';

/** Composantes minimales nécessaires au calcul argent. */
type MoneyParts = Pick<
  TimeSeriesPoint,
  'adsenseCents' | 'manualCashCents' | 'inKindCents' | 'expenseCents'
>;

export interface MoneyOptions {
  /** Compter les avantages en nature dans le chiffre d'affaires. */
  includeInKind: boolean;
}

/** Revenus réellement encaissés : AdSense + revenus manuels de nature cash. */
export const cashRevenue = (p: MoneyParts): Cents => p.adsenseCents + p.manualCashCents;

/**
 * Chiffre d'affaires. Les avantages en nature sont inclus à la demande :
 * ils comptent dans ce qui est « gagné » mais ne sont jamais du cash.
 */
export const grossRevenue = (p: MoneyParts, options: MoneyOptions): Cents =>
  cashRevenue(p) + (options.includeInKind ? p.inKindCents : 0);

/**
 * Bénéfice = CA - dépenses.
 * Les dépenses ne sont retranchées qu'une fois, sans plafonnement, pour que le
 * graphique montre honnêtement un bénéfice négatif si elles dépassent les revenus.
 */
export const netProfit = (p: MoneyParts, options: MoneyOptions): Cents =>
  grossRevenue(p, options) - p.expenseCents;

/** Variation relative entre deux périodes, `null` si la référence est nulle. */
export const percentChange = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};

export const emptyTotals = (): AnalyticsTotals => ({
  views: 0,
  watchHours: 0,
  subscribersGained: 0,
  subscribersLost: 0,
  subscribersNet: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  subscribersTotal: null,
  videosPublished: 0,
  inKindEntries: 0,
  adsenseCents: 0,
  manualCashCents: 0,
  inKindCents: 0,
  expenseCents: 0,
});
