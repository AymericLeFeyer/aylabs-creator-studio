import type { AnalyticsTotals, TimeSeriesPoint } from '../entities/Analytics.ts';

/** Composantes d'argent communes aux points de série et aux cumuls. */
type MoneyParts = Pick<
  TimeSeriesPoint,
  'adsenseCents' | 'manualCashCents' | 'inKindCents' | 'expenseCents'
>;

/**
 * Les deux réglages du graphique d'argent :
 * - `mode` bascule entre chiffre d'affaires et bénéfices (CA moins les dépenses saisies) ;
 * - `includeInKind` décide si les produits reçus comptent dans le total. Ils sont bien
 *   « gagnés », mais l'argent n'est jamais arrivé sur le compte, d'où la coche séparée.
 */
export type MoneyMode = 'revenue' | 'profit';

export interface MoneyOptions {
  mode: MoneyMode;
  includeInKind: boolean;
}

/** Encaissé réellement : AdSense + revenus manuels de nature cash. */
export const cashRevenue = (p: MoneyParts): number => p.adsenseCents + p.manualCashCents;

export const grossRevenue = (p: MoneyParts, includeInKind: boolean): number =>
  cashRevenue(p) + (includeInKind ? p.inKindCents : 0);

/** Bénéfice = CA - dépenses. Volontairement non plafonné : un mois déficitaire doit se voir. */
export const netProfit = (p: MoneyParts, includeInKind: boolean): number =>
  grossRevenue(p, includeInKind) - p.expenseCents;

/** Valeur affichée sur le graphique, selon les deux réglages. */
export const moneyValue = (p: MoneyParts, options: MoneyOptions): number =>
  options.mode === 'profit'
    ? netProfit(p, options.includeInKind)
    : grossRevenue(p, options.includeInKind);

export const percentChange = (current: number, previous: number): number | null => {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
};

/** Compare un cumul à celui de la période précédente, quand elle est disponible. */
export const compareTotals = (
  current: AnalyticsTotals,
  previous: AnalyticsTotals | null,
  pick: (totals: AnalyticsTotals) => number,
): number | null => (previous ? percentChange(pick(current), pick(previous)) : null);
