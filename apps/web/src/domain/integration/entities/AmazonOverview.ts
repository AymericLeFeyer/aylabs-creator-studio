/**
 * Contrat de `/api/amazon/overview`, dupliqué depuis l'API comme tout le reste du front.
 * **Toute évolution doit être répercutée des deux côtés.**
 */

export interface AmazonSeriesPoint {
  date: string;
  clicks: number | null;
  itemsOrdered: number | null;
  itemsShipped: number | null;
  itemsReturned: number | null;
  shippedRevenueCents: number | null;
  earningsCents: number | null;
}

export interface AmazonTotals {
  clicks: number | null;
  itemsOrdered: number | null;
  itemsShipped: number | null;
  itemsReturned: number | null;
  shippedRevenueCents: number | null;
  earningsCents: number | null;
  /** `itemsOrdered / clicks`, en pourcentage — recalculé, jamais moyenné. */
  conversionRate: number | null;
  days: number;
}

/** Un mois tel qu'Amazon l'a annoncé à son dernier relevé. */
export interface AmazonMonth {
  /** `AAAA-MM`. */
  month: string;
  /** Date du relevé : un mois en cours ou relevé avant sa fin n'est pas complet. */
  date: string;
  clicks: number | null;
  itemsOrdered: number | null;
  itemsShipped: number | null;
  itemsReturned: number | null;
  shippedRevenueCents: number | null;
  earningsCents: number | null;
  conversionRate: number | null;
}

export interface AmazonOverview {
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
  series: AmazonSeriesPoint[];
  totals: AmazonTotals;
  previousTotals: AmazonTotals;
  /** Tous les mois connus, du plus ancien au plus récent — **hors période**. */
  months: AmazonMonth[];
  /** Le mois en cours au dernier relevé, et les paiements en attente — **hors période**. */
  current: (AmazonMonth & { waitingPaymentsCents: number | null }) | null;
  firstSnapshotDate: string | null;
}
