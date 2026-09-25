import type { Granularity, IsoDate } from '../../../shared/dates.ts';

/**
 * L'historique Amazon Partenaires, reconstruit depuis `amazon_snapshots`.
 *
 * Tous les compteurs sont des FLUX par bucket (clics, articles, gains du jour ou de la
 * semaine), obtenus par différence de relevés **dans un même mois** — Amazon remet ses
 * compteurs à zéro le 1er. `null` avant le premier relevé : sans point de départ, la part
 * de la période ne se distingue pas du cumul du mois.
 */
export interface AmazonSeriesPoint {
  date: IsoDate;
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
  date: IsoDate;
  clicks: number | null;
  itemsOrdered: number | null;
  itemsShipped: number | null;
  itemsReturned: number | null;
  shippedRevenueCents: number | null;
  earningsCents: number | null;
  conversionRate: number | null;
}

export interface AmazonOverview {
  from: IsoDate;
  to: IsoDate;
  granularity: Granularity;
  series: AmazonSeriesPoint[];
  totals: AmazonTotals;
  previousTotals: AmazonTotals;
  /** Tous les mois connus, du plus ancien au plus récent — **hors période**. */
  months: AmazonMonth[];
  /** Le mois en cours au dernier relevé, et les paiements en attente — **hors période**. */
  current: (AmazonMonth & { waitingPaymentsCents: number | null }) | null;
  firstSnapshotDate: IsoDate | null;
}
