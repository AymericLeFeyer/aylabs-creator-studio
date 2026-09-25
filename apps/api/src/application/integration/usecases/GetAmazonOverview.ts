import type {
  AmazonMonth,
  AmazonOverview,
  AmazonSeriesPoint,
  AmazonTotals,
} from '../../../domain/integration/entities/AmazonOverview.ts';
import type {
  AmazonSnapshotRepository,
  AmazonSnapshotRow,
} from '../../../domain/integration/repositories/AmazonSnapshotRepository.ts';
import {
  addDays,
  enumerateBuckets,
  type Granularity,
  type IsoDate,
} from '../../../shared/dates.ts';

export interface AmazonQuery {
  from: IsoDate;
  to: IsoDate;
  granularity: Granularity;
}

type Counter = Exclude<keyof AmazonSnapshotRow, 'date' | 'waitingPaymentsCents'>;

const COUNTERS: Counter[] = [
  'clicks',
  'itemsOrdered',
  'itemsShipped',
  'itemsReturned',
  'shippedRevenueCents',
  'earningsCents',
];

const monthOf = (date: IsoDate): string => date.slice(0, 7);

/**
 * Ce qu'a apporté le relevé `current` depuis `previous`.
 *
 * Amazon ne donne que des cumuls **du mois en cours**. Dans un même mois, le gain est la
 * différence des deux relevés (planchée à zéro : Amazon révise parfois à la baisse). Quand
 * `current` ouvre un nouveau mois, son cumul entier est ce mois-ci — ce qui a pu se passer
 * entre le dernier relevé du mois précédent et sa fin est perdu, faute de relevé.
 */
const gainBetween = (
  previous: AmazonSnapshotRow | null,
  current: AmazonSnapshotRow,
  key: Counter,
): number | null => {
  const value = current[key];
  if (value === null) return null;
  if (!previous || monthOf(previous.date) !== monthOf(current.date)) return value;
  const before = previous[key];
  return before === null ? value : Math.max(0, value - before);
};

const conversion = (ordered: number | null, clicks: number | null): number | null =>
  ordered === null || !clicks ? null : Math.round((ordered / clicks) * 10_000) / 100;

/**
 * L'écran Affiliations → Amazon, en une requête.
 *
 * Même rôle que `GetDomadooOverview`, avec une différence de nature : Domadoo renvoie des
 * totaux depuis toujours, Amazon des cumuls du mois remis à zéro le 1er (voir
 * `gainBetween`). `months` et `current` ignorent la période : ce sont les chiffres
 * qu'Amazon annonce lui-même, mois par mois.
 */
export class GetAmazonOverview {
  private readonly snapshots: AmazonSnapshotRepository;

  constructor(snapshots: AmazonSnapshotRepository) {
    this.snapshots = snapshots;
  }

  execute(query: AmazonQuery): AmazonOverview {
    const { from, to, granularity } = query;
    const series = this.buildSeries(from, to, granularity);

    const spanDays = Math.max(1, daysBetween(from, to) + 1);
    const previousTo = addDays(from, -1);
    const previousFrom = addDays(previousTo, -(spanDays - 1));
    const previousSeries = this.buildSeries(previousFrom, previousTo, granularity);

    const monthEnds = this.snapshots.findMonthEnds();
    const last = monthEnds.at(-1) ?? null;

    return {
      from,
      to,
      granularity,
      series,
      totals: buildTotals(from, to, series),
      previousTotals: buildTotals(previousFrom, previousTo, previousSeries),
      months: monthEnds.map(toMonth),
      current: last ? { ...toMonth(last), waitingPaymentsCents: last.waitingPaymentsCents } : null,
      firstSnapshotDate: this.snapshots.findFirstDate(),
    };
  }

  private buildSeries(from: IsoDate, to: IsoDate, granularity: Granularity): AmazonSeriesPoint[] {
    const rows = this.snapshots.findInRange(from, to);
    let previous = this.snapshots.findBefore(from);
    const buckets = enumerateBuckets(from, to, granularity);
    let cursor = 0;

    return buckets.map((bucket, i) => {
      const nextBucket = buckets[i + 1];
      const bucketEnd = nextBucket ? addDays(nextBucket, -1) : to;
      const point: AmazonSeriesPoint = {
        date: bucket,
        clicks: null,
        itemsOrdered: null,
        itemsShipped: null,
        itemsReturned: null,
        shippedRevenueCents: null,
        earningsCents: null,
      };
      // Sans aucun relevé jusque-là, le bucket reste à `null` : « pas mesuré », pas zéro.
      const measured = previous !== null || (rows[cursor]?.date ?? '9999') <= bucketEnd;
      if (measured) for (const key of COUNTERS) point[key] = 0;

      while (cursor < rows.length && rows[cursor]!.date <= bucketEnd) {
        const row = rows[cursor]!;
        // Le tout premier relevé de l'historique n'a pas de point de départ : son cumul du
        // mois ne dit pas ce qui s'est passé CE jour-là, il sert seulement de base.
        // Un relevé du 1er, lui, ne couvre que ce jour-là.
        if (previous !== null || row.date.endsWith('-01')) {
          for (const key of COUNTERS) {
            const gain = gainBetween(previous, row, key);
            if (gain !== null) point[key] = (point[key] ?? 0) + gain;
          }
        }
        previous = row;
        cursor += 1;
      }
      return point;
    });
  }
}

const toMonth = (row: AmazonSnapshotRow): AmazonMonth => ({
  month: monthOf(row.date),
  date: row.date,
  clicks: row.clicks,
  itemsOrdered: row.itemsOrdered,
  itemsShipped: row.itemsShipped,
  itemsReturned: row.itemsReturned,
  shippedRevenueCents: row.shippedRevenueCents,
  earningsCents: row.earningsCents,
  conversionRate: conversion(row.itemsOrdered, row.clicks),
});

const buildTotals = (from: IsoDate, to: IsoDate, series: AmazonSeriesPoint[]): AmazonTotals => {
  const sum = (key: Counter): number | null => {
    let total: number | null = null;
    for (const point of series) {
      const value = point[key];
      if (value !== null) total = (total ?? 0) + value;
    }
    return total;
  };
  const clicks = sum('clicks');
  const itemsOrdered = sum('itemsOrdered');
  return {
    clicks,
    itemsOrdered,
    itemsShipped: sum('itemsShipped'),
    itemsReturned: sum('itemsReturned'),
    shippedRevenueCents: sum('shippedRevenueCents'),
    earningsCents: sum('earningsCents'),
    conversionRate: conversion(itemsOrdered, clicks),
    days: Math.max(1, daysBetween(from, to) + 1),
  };
};

const daysBetween = (from: IsoDate, to: IsoDate): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
