import type {
  DomadooOverview,
  DomadooSeriesPoint,
  DomadooTotals,
} from '../../../domain/integration/entities/DomadooOverview.ts';
import type {
  DomadooSnapshotRepository,
  DomadooSnapshotRow,
} from '../../../domain/integration/repositories/DomadooSnapshotRepository.ts';
import {
  addDays,
  enumerateBuckets,
  type Granularity,
  type IsoDate,
} from '../../../shared/dates.ts';

export interface DomadooQuery {
  from: IsoDate;
  to: IsoDate;
  granularity: Granularity;
}

/**
 * L'écran Affiliations → Domadoo, en une requête.
 *
 * `domadoo_snapshots` ne porte que des relevés **cumulatifs** (clics, ventes validées,
 * gains, solde — un total depuis toujours, exactement comme `channel_snapshots`). Ce que
 * l'écran affiche par bucket est donc reconstruit ici :
 *
 * - `clicksGained` / `approvedSalesGained` / `earningsGainedCents` sont des FLUX, obtenus
 *   par différence entre deux relevés cumulatifs consécutifs, planchée à zéro — même
 *   raison que `sumStatsOverRange` sur les vidéos : une correction à la baisse ne doit pas
 *   afficher un gain négatif ;
 * - `balanceCents` / `waitingPaymentsCents` / `waitingSalesCents` sont des ÉTATS, portés
 *   par le dernier relevé connu du bucket (report de la dernière valeur, comme les
 *   abonnés Instagram) : un bucket sans collecte ne doit pas faire retomber le solde à
 *   zéro.
 *
 * Un bucket **avant tout relevé** rend `null` sur les champs de flux : sans relevé
 * antérieur, la part de la période ne se distingue pas du cumul d'avant.
 */
export class GetDomadooOverview {
  private readonly snapshots: DomadooSnapshotRepository;

  constructor(snapshots: DomadooSnapshotRepository) {
    this.snapshots = snapshots;
  }

  execute(query: DomadooQuery): DomadooOverview {
    const { from, to, granularity } = query;

    const series = this.buildSeries(
      from,
      to,
      granularity,
      this.snapshots.findBefore(from),
      this.snapshots.findInRange(from, to),
    );
    const totals = this.buildTotals(from, to, series);

    // La période précédente, de même longueur, pour les variations en pourcentage.
    const spanDays = Math.max(1, daysBetween(from, to) + 1);
    const previousTo = addDays(from, -1);
    const previousFrom = addDays(previousTo, -(spanDays - 1));
    const previousSeries = this.buildSeries(
      previousFrom,
      previousTo,
      granularity,
      this.snapshots.findBefore(previousFrom),
      this.snapshots.findInRange(previousFrom, previousTo),
    );
    const previousTotals = this.buildTotals(previousFrom, previousTo, previousSeries);

    return {
      from,
      to,
      granularity,
      series,
      totals,
      previousTotals,
      firstSnapshotDate: this.snapshots.findFirstDate(),
      lastUpdate: this.snapshots.findAtOrBefore(to)?.date ?? null,
    };
  }

  private buildSeries(
    from: IsoDate,
    to: IsoDate,
    granularity: Granularity,
    baseline: DomadooSnapshotRow | null,
    rows: DomadooSnapshotRow[],
  ): DomadooSeriesPoint[] {
    const buckets = enumerateBuckets(from, to, granularity);
    let cursor = 0;
    let carried = baseline;
    let previousCumulative = baseline;
    const points: DomadooSeriesPoint[] = [];

    const gained = (pick: (row: DomadooSnapshotRow) => number | null): number | null => {
      if (!carried || !previousCumulative) return null;
      const current = pick(carried);
      const before = pick(previousCumulative);
      if (current === null || before === null) return null;
      return Math.max(0, current - before);
    };

    for (let i = 0; i < buckets.length; i += 1) {
      const bucket = buckets[i]!;
      // Le dernier jour couvert par ce bucket : celui du bucket suivant moins un jour, ou
      // `to` pour le dernier — un bucket ne doit jamais aller lire un relevé au-delà de la
      // période demandée.
      const nextBucket = buckets[i + 1];
      const bucketEnd = nextBucket ? addDays(nextBucket, -1) : to;

      while (cursor < rows.length && rows[cursor]!.date <= bucketEnd) {
        carried = rows[cursor]!;
        cursor += 1;
      }

      points.push({
        date: bucket,
        clicksGained: gained((row) => row.clicks),
        approvedSalesGained: gained((row) => row.approvedSales),
        earningsGainedCents: gained((row) => row.earningsCents),
        balanceCents: carried?.balanceCents ?? null,
        waitingPaymentsCents: carried?.waitingPaymentsCents ?? null,
        waitingSalesCents: carried?.waitingSalesCents ?? null,
      });

      previousCumulative = carried;
    }

    return points;
  }

  private buildTotals(from: IsoDate, to: IsoDate, series: DomadooSeriesPoint[]): DomadooTotals {
    const sum = (pick: (point: DomadooSeriesPoint) => number | null): number | null => {
      let total: number | null = null;
      for (const point of series) {
        const value = pick(point);
        if (value !== null) total = (total ?? 0) + value;
      }
      return total;
    };

    // Le dernier point qui porte un état : les buckets vides en fin de période (aucune
    // collecte depuis) ne doivent pas faire lire un solde à `null`.
    const last = [...series].reverse().find((point) => point.balanceCents !== null);

    return {
      clicksGained: sum((point) => point.clicksGained),
      approvedSalesGained: sum((point) => point.approvedSalesGained),
      earningsGainedCents: sum((point) => point.earningsGainedCents),
      balanceCents: last?.balanceCents ?? null,
      waitingPaymentsCents: last?.waitingPaymentsCents ?? null,
      waitingSalesCents: last?.waitingSalesCents ?? null,
      days: Math.max(1, daysBetween(from, to) + 1),
    };
  }
}

const daysBetween = (from: IsoDate, to: IsoDate): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
