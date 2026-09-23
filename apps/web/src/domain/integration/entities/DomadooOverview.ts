/**
 * Contrat de `/api/domadoo/overview`, dupliqué depuis l'API comme tout le reste du front.
 * **Toute évolution doit être répercutée des deux côtés.**
 */

export interface DomadooSeriesPoint {
  date: string;
  clicksGained: number | null;
  approvedSalesGained: number | null;
  earningsGainedCents: number | null;
  balanceCents: number | null;
  waitingPaymentsCents: number | null;
  waitingSalesCents: number | null;
}

export interface DomadooTotals {
  clicksGained: number | null;
  approvedSalesGained: number | null;
  earningsGainedCents: number | null;
  balanceCents: number | null;
  waitingPaymentsCents: number | null;
  waitingSalesCents: number | null;
  days: number;
}

export interface DomadooOverview {
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
  series: DomadooSeriesPoint[];
  totals: DomadooTotals;
  previousTotals: DomadooTotals;
  /** `null` tant qu'aucune collecte n'a écrit d'instantané. */
  firstSnapshotDate: string | null;
  lastUpdate: string | null;
}
