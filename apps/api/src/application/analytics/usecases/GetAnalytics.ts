import type { Granularity, IsoDate } from '../../../shared/dates.ts';
import { addDays, bucketStart, enumerateBuckets, parseIsoDate } from '../../../shared/dates.ts';
import type { ChannelRepository } from '../../../domain/channel/repositories/ChannelRepository.ts';
import type { MetricsRepository } from '../../../domain/metrics/repositories/MetricsRepository.ts';
import type { CategoryRepository } from '../../../domain/category/repositories/CategoryRepository.ts';
import type { RevenueEntryRepository } from '../../../domain/revenue/repositories/RevenueRepository.ts';
import type { ExpenseRepository } from '../../../domain/expense/repositories/ExpenseRepository.ts';
import type { VideoRepository } from '../../../domain/video/repositories/VideoRepository.ts';
import type {
  AnalyticsQuery,
  AnalyticsResult,
  AnalyticsTotals,
  CategoryBreakdownItem,
  ChannelBreakdownItem,
  TimeSeriesPoint,
  VideoMarker,
} from '../../../domain/analytics/entities/TimeSeries.ts';
import { emptyTotals } from '../../../domain/analytics/services/revenueMath.ts';

const emptyPoint = (date: IsoDate): TimeSeriesPoint => ({
  date,
  views: 0,
  watchHours: 0,
  subscribersGained: 0,
  subscribersLost: 0,
  subscribersNet: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  subscribersTotal: null,
  viewsTotal: null,
  adsenseCents: 0,
  manualCashCents: 0,
  inKindCents: 0,
  expenseCents: 0,
  revenueByCategory: {},
  expenseByCategory: {},
});

/** Accumule un montant sur une catégorie du bucket, sans créer d'entrée à zéro. */
const addCategory = (bucket: Record<string, number>, categoryId: string, cents: number): void => {
  bucket[categoryId] = (bucket[categoryId] ?? 0) + cents;
};

/**
 * Construit les séries temporelles du dashboard, pour une chaîne ou en cumulé.
 *
 * Deux natures de données coexistent et ne s'agrègent pas pareil :
 * - les FLUX (vues, abonnés gagnés, argent) se somment sur le bucket et entre chaînes ;
 * - les CUMULS (total d'abonnés) prennent la dernière valeur connue du bucket, reportée
 *   depuis le dernier relevé si la collecte a sauté un jour, puis se somment entre chaînes.
 */
export class GetAnalytics {
  private readonly channels: ChannelRepository;
  private readonly metrics: MetricsRepository;
  private readonly revenues: RevenueEntryRepository;
  private readonly categories: CategoryRepository;
  private readonly expenses: ExpenseRepository;
  private readonly videos: VideoRepository;

  constructor(
    channels: ChannelRepository,
    metrics: MetricsRepository,
    revenues: RevenueEntryRepository,
    categories: CategoryRepository,
    expenses: ExpenseRepository,
    videos: VideoRepository,
  ) {
    this.channels = channels;
    this.metrics = metrics;
    this.revenues = revenues;
    this.categories = categories;
    this.expenses = expenses;
    this.videos = videos;
  }

  execute(query: AnalyticsQuery): AnalyticsResult {
    const allChannels = this.channels.findAll({ includeArchived: true });
    const activeIds =
      query.channelIds.length > 0
        ? query.channelIds
        : allChannels.filter((c) => !c.isArchived).map((c) => c.id);

    const series = this.buildSeries(activeIds, query.from, query.to, query.granularity, query);
    const totals = this.sumTotals(series);

    // Abonnés en fin de période : la dernière valeur connue, pas la somme des buckets.
    totals.subscribersTotal = this.sumLatestSubscribers(activeIds, query.to);

    return {
      query,
      series,
      totals,
      byCategory: this.buildCategoryBreakdown(activeIds, query),
      byExpenseCategory: this.buildExpenseBreakdown(activeIds, query),
      byChannel: this.buildChannelBreakdown(activeIds, allChannels, query),
      videos: this.buildVideoMarkers(activeIds, allChannels, query),
      previousTotals: this.buildPreviousTotals(activeIds, query),
    };
  }

  /** Agrège flux et cumuls en points de série, trous compris. */
  private buildSeries(
    channelIds: string[],
    from: IsoDate,
    to: IsoDate,
    granularity: Granularity,
    query: AnalyticsQuery,
  ): TimeSeriesPoint[] {
    const buckets = enumerateBuckets(from, to, granularity);
    const points = new Map<IsoDate, TimeSeriesPoint>();
    for (const bucket of buckets) points.set(bucket, emptyPoint(bucket));

    const at = (date: IsoDate): TimeSeriesPoint | undefined =>
      points.get(bucketStart(date, granularity));

    // --- Flux d'audience + AdSense ---
    const adsenseCategoryId = this.autoCategoryId();
    for (const metric of this.metrics.findDailyMetrics(channelIds, { from, to })) {
      const point = at(metric.date);
      if (!point) continue;
      point.views += metric.views;
      point.watchHours += metric.watchMinutes / 60;
      point.subscribersGained += metric.subscribersGained;
      point.subscribersLost += metric.subscribersLost;
      point.likes += metric.likes;
      point.comments += metric.comments;
      point.shares += metric.shares;
      point.adsenseCents += metric.estimatedRevenueCents;
      if (adsenseCategoryId && metric.estimatedRevenueCents !== 0) {
        addCategory(point.revenueByCategory, adsenseCategoryId, metric.estimatedRevenueCents);
      }
    }

    const entryFilter = {
      range: { from, to },
      channelIds,
      includeUnassigned: query.includeUnassigned,
    };

    // --- Revenus manuels, séparés par nature et par catégorie ---
    for (const row of this.revenues.sumByDate(entryFilter)) {
      const point = at(row.date);
      if (!point) continue;
      if (row.nature === 'in_kind') point.inKindCents += row.totalCents;
      else point.manualCashCents += row.totalCents;
      addCategory(point.revenueByCategory, row.categoryId, row.totalCents);
    }

    // --- Dépenses ---
    for (const row of this.expenses.sumByDate(entryFilter)) {
      const point = at(row.date);
      if (!point) continue;
      point.expenseCents += row.totalCents;
      addCategory(point.expenseByCategory, row.categoryId, row.totalCents);
    }

    // --- Cumuls d'abonnés, avec report de la dernière valeur connue ---
    this.applyCumulativeTotals(channelIds, from, to, granularity, points);

    for (const point of points.values()) {
      point.subscribersNet = point.subscribersGained - point.subscribersLost;
      point.watchHours = Math.round(point.watchHours * 100) / 100;
    }

    return buckets.map((bucket) => points.get(bucket)!);
  }

  /**
   * Remplit `subscribersTotal` / `viewsTotal` bucket par bucket.
   *
   * On amorce chaque chaîne avec son dernier relevé antérieur à la période : sans ça,
   * une chaîne collectée hier mais pas aujourd'hui ferait chuter la courbe cumulée à zéro.
   */
  private applyCumulativeTotals(
    channelIds: string[],
    from: IsoDate,
    to: IsoDate,
    granularity: Granularity,
    points: Map<IsoDate, TimeSeriesPoint>,
  ): void {
    const lastKnownSubs = new Map<string, number>();
    const lastKnownViews = new Map<string, number>();

    for (const channelId of channelIds) {
      const seed = this.metrics.findLatestSnapshotAt(channelId, addDays(from, -1));
      if (seed) {
        lastKnownSubs.set(channelId, seed.subscribers);
        lastKnownViews.set(channelId, seed.totalViews);
      }
    }

    // Dernier snapshot de chaque chaîne dans chaque bucket (les snapshots sont triés par date).
    const perBucket = new Map<IsoDate, Map<string, { subs: number; views: number }>>();
    for (const snapshot of this.metrics.findSnapshots(channelIds, { from, to })) {
      const bucket = bucketStart(snapshot.date, granularity);
      let inBucket = perBucket.get(bucket);
      if (!inBucket) {
        inBucket = new Map();
        perBucket.set(bucket, inBucket);
      }
      inBucket.set(snapshot.channelId, {
        subs: snapshot.subscribers,
        views: snapshot.totalViews,
      });
    }

    // Parcours chronologique : l'état courant se propage aux buckets sans relevé.
    for (const [bucket, point] of points) {
      for (const [channelId, value] of perBucket.get(bucket) ?? []) {
        lastKnownSubs.set(channelId, value.subs);
        lastKnownViews.set(channelId, value.views);
      }
      if (lastKnownSubs.size > 0) {
        point.subscribersTotal = [...lastKnownSubs.values()].reduce((a, b) => a + b, 0);
        point.viewsTotal = [...lastKnownViews.values()].reduce((a, b) => a + b, 0);
      }
    }
  }

  private sumLatestSubscribers(channelIds: string[], at: IsoDate): number | null {
    let total = 0;
    let found = false;
    for (const channelId of channelIds) {
      const snapshot = this.metrics.findLatestSnapshotAt(channelId, at);
      if (snapshot) {
        total += snapshot.subscribers;
        found = true;
      }
    }
    return found ? total : null;
  }

  private sumTotals(series: TimeSeriesPoint[]): AnalyticsTotals {
    const totals = emptyTotals();
    for (const point of series) {
      totals.views += point.views;
      totals.watchHours += point.watchHours;
      totals.subscribersGained += point.subscribersGained;
      totals.subscribersLost += point.subscribersLost;
      totals.likes += point.likes;
      totals.comments += point.comments;
      totals.shares += point.shares;
      totals.adsenseCents += point.adsenseCents;
      totals.manualCashCents += point.manualCashCents;
      totals.inKindCents += point.inKindCents;
      totals.expenseCents += point.expenseCents;
    }
    totals.subscribersNet = totals.subscribersGained - totals.subscribersLost;
    totals.watchHours = Math.round(totals.watchHours * 100) / 100;
    return totals;
  }

  /**
   * Identifiant de la catégorie alimentée par la collecte (AdSense), pour rattacher les
   * revenus de `daily_metrics` à une couleur dans les séries. `null` si elle a été
   * supprimée : les revenus AdSense restent alors dans `adsenseCents`, sans détail.
   */
  private autoCategoryId(): string | null {
    const auto = this.categories.findAll({ includeArchived: true }).find((c) => c.isAuto);
    return auto?.id ?? null;
  }

  /** Répartition des revenus par catégorie, AdSense inclus depuis les métriques collectées. */
  private buildCategoryBreakdown(
    channelIds: string[],
    query: AnalyticsQuery,
  ): CategoryBreakdownItem[] {
    const byId = new Map(this.categories.findAll({ includeArchived: true }).map((c) => [c.id, c]));
    const items: CategoryBreakdownItem[] = [];

    const sums = this.revenues.sumByCategory({
      range: { from: query.from, to: query.to },
      channelIds,
      includeUnassigned: query.includeUnassigned,
    });

    for (const sum of sums) {
      const category = byId.get(sum.categoryId);
      if (!category) continue;
      items.push({
        categoryId: category.id,
        categoryName: category.name,
        color: category.color,
        nature: category.nature,
        totalCents: sum.totalCents,
      });
    }

    // AdSense ne vit pas dans revenue_entries : on l'injecte depuis daily_metrics.
    const adsenseCents = this.metrics
      .findDailyMetrics(channelIds, { from: query.from, to: query.to })
      .reduce((sum, m) => sum + m.estimatedRevenueCents, 0);

    const adsenseId = this.autoCategoryId();
    const adsenseCategory = adsenseId ? byId.get(adsenseId) : undefined;
    if (adsenseCategory && adsenseCents !== 0) {
      items.push({
        categoryId: adsenseCategory.id,
        categoryName: adsenseCategory.name,
        color: adsenseCategory.color,
        nature: adsenseCategory.nature,
        totalCents: adsenseCents,
      });
    }

    return items.sort((a, b) => b.totalCents - a.totalCents);
  }

  /** Répartition des dépenses par catégorie sur la période. */
  private buildExpenseBreakdown(
    channelIds: string[],
    query: AnalyticsQuery,
  ): CategoryBreakdownItem[] {
    const byId = new Map(this.categories.findAll({ includeArchived: true }).map((c) => [c.id, c]));

    return this.expenses
      .sumByCategory({
        range: { from: query.from, to: query.to },
        channelIds,
        includeUnassigned: query.includeUnassigned,
      })
      .flatMap((sum) => {
        const category = byId.get(sum.categoryId);
        if (!category) return [];
        return [
          {
            categoryId: category.id,
            categoryName: category.name,
            color: category.color,
            nature: category.nature,
            totalCents: sum.totalCents,
          } satisfies CategoryBreakdownItem,
        ];
      })
      .sort((a, b) => b.totalCents - a.totalCents);
  }

  /**
   * Sorties de vidéo de la période, déjà rangées dans leur bucket.
   *
   * Le bucket est calculé ici plutôt que côté front : la règle de découpage
   * (semaine ISO commençant le lundi) n'existe qu'une fois, dans `shared/dates`.
   */
  private buildVideoMarkers(
    channelIds: string[],
    allChannels: ReturnType<ChannelRepository['findAll']>,
    query: AnalyticsQuery,
  ): VideoMarker[] {
    return this.videos
      .findAll({ range: { from: query.from, to: query.to }, channelIds })
      .flatMap((video) => {
        const channel = allChannels.find((c) => c.id === video.channelId);
        if (!channel) return [];
        return [
          {
            id: video.id,
            channelId: video.channelId,
            channelName: channel.name,
            channelColor: channel.color,
            title: video.title,
            thumbnailUrl: video.thumbnailUrl,
            date: video.date,
            bucket: bucketStart(video.date, query.granularity),
          } satisfies VideoMarker,
        ];
      });
  }

  /** Détail par chaîne, pour comparer les chaînes entre elles sur la période. */
  private buildChannelBreakdown(
    channelIds: string[],
    allChannels: ReturnType<ChannelRepository['findAll']>,
    query: AnalyticsQuery,
  ): ChannelBreakdownItem[] {
    const range = { from: query.from, to: query.to };

    return channelIds
      .map((channelId) => {
        const channel = allChannels.find((c) => c.id === channelId);
        if (!channel) return null;

        const metrics = this.metrics.findDailyMetrics([channelId], range);
        const views = metrics.reduce((s, m) => s + m.views, 0);
        const subscribersNet = metrics.reduce(
          (s, m) => s + m.subscribersGained - m.subscribersLost,
          0,
        );
        const adsenseCents = metrics.reduce((s, m) => s + m.estimatedRevenueCents, 0);

        // Pas de `includeUnassigned` ici : un revenu global n'appartient à aucune chaîne
        // et le compter partout gonflerait artificiellement chaque ligne.
        const revenueRows = this.revenues.sumByDate({
          range,
          channelIds: [channelId],
          includeUnassigned: false,
        });
        const manualCashCents = revenueRows
          .filter((r) => r.nature === 'cash')
          .reduce((s, r) => s + r.totalCents, 0);
        const inKindCents = revenueRows
          .filter((r) => r.nature === 'in_kind')
          .reduce((s, r) => s + r.totalCents, 0);

        const snapshot = this.metrics.findLatestSnapshotAt(channelId, query.to);

        return {
          channelId: channel.id,
          channelName: channel.name,
          color: channel.color,
          views,
          subscribersNet,
          subscribersTotal: snapshot?.subscribers ?? null,
          revenueCashCents: adsenseCents + manualCashCents,
          inKindCents,
        } satisfies ChannelBreakdownItem;
      })
      .filter((item): item is ChannelBreakdownItem => item !== null)
      .sort((a, b) => b.views - a.views);
  }

  /** Période précédente de même longueur, pour afficher les variations en %. */
  private buildPreviousTotals(channelIds: string[], query: AnalyticsQuery): AnalyticsTotals | null {
    const days = Math.round(
      (parseIsoDate(query.to).getTime() - parseIsoDate(query.from).getTime()) / 86_400_000,
    );
    if (days < 0) return null;

    const previousTo = addDays(query.from, -1);
    const previousFrom = addDays(previousTo, -days);

    const series = this.buildSeries(channelIds, previousFrom, previousTo, 'day', {
      ...query,
      from: previousFrom,
      to: previousTo,
    });
    const totals = this.sumTotals(series);
    totals.subscribersTotal = this.sumLatestSubscribers(channelIds, previousTo);
    return totals;
  }
}
