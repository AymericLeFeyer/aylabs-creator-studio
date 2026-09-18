import type {
  InstagramOverview,
  InstagramSeriesPoint,
  InstagramTotals,
} from '../../../domain/instagram/entities/InstagramOverview.ts';
import type {
  InstagramAccountRepository,
  InstagramDataRepository,
} from '../../../domain/instagram/repositories/InstagramRepository.ts';
import {
  addDays,
  bucketStart,
  enumerateBuckets,
  type Granularity,
  type IsoDate,
} from '../../../shared/dates.ts';

export interface InstagramQuery {
  from: IsoDate;
  to: IsoDate;
  granularity: Granularity;
  accountIds: string[];
}

/**
 * L'écran Instagram, en une requête.
 *
 * Le découpage FLUX / CUMUL est le même que pour les séries YouTube, et pour la même
 * raison : **`stories`, `posts`, `reach` et `views` se somment** dans le bucket et entre
 * comptes ; **`followers` non** — c'est un cumul dont on prend la dernière valeur connue,
 * reportée sur les jours sans relevé pour qu'un jour non collecté ne fasse pas plonger la
 * courbe à zéro. Exactement `applyCumulativeTotals` côté analytics.
 *
 * Le comptage de stories est **le** chiffre de cet écran, et il porte un aveu que les
 * autres n'ont pas : avant `firstStoryDate`, un zéro ne veut pas dire « rien publié » mais
 * « rien collecté ». L'API ne laisse aucune chance de le rattraper, et l'écran doit le
 * dire au lieu de laisser lire un mois blanc.
 */
export class GetInstagramOverview {
  private readonly accounts: InstagramAccountRepository;
  private readonly data: InstagramDataRepository;

  constructor(accounts: InstagramAccountRepository, data: InstagramDataRepository) {
    this.accounts = accounts;
    this.data = data;
  }

  execute(query: InstagramQuery): InstagramOverview {
    const { from, to, granularity, accountIds } = query;
    const filter = { accountIds, range: { from, to } };

    const storiesByDate = this.storiesByDate(filter);
    const mediaByDate = this.data.countMediaByDate(filter);
    const metrics = this.data.findDailyMetrics(filter);
    const snapshots = this.data.findSnapshots(filter);
    const accounts = this.accounts.findAll();
    // Relevés par leur seul profil public ET sans aucune publication archivée — la voie
    // `page` du relevé ne rend que des compteurs. Pour eux seuls, les parutions se
    // déduisent du compteur de publications. Dès qu'une publication est archivée, ce sont
    // les lignes `ig_media` qui comptent : les deux ensemble compteraient chaque post deux
    // fois.
    const profileOnly = new Set(
      this.accounts
        .findAll(true)
        .filter((account) => !account.hasToken)
        .filter(
          (account) => this.data.findMedia({ accountIds: [account.id], limit: 1 }).length === 0,
        )
        .map((account) => account.id),
    );

    const series = this.buildSeries({
      from,
      to,
      granularity,
      storiesByDate,
      mediaByDate,
      metrics,
      snapshots,
      snapshotsBefore: this.data.findSnapshotBefore(accountIds, from),
      profileOnly,
      accountIds,
    });

    const totals = this.buildTotals(series, from, to, storiesByDate, accountIds);

    // La période précédente, de même longueur, pour les variations en pourcentage.
    const spanDays = Math.max(1, daysBetween(from, to) + 1);
    const previousTo = addDays(from, -1);
    const previousFrom = addDays(previousTo, -(spanDays - 1));
    const previousFilter = { accountIds, range: { from: previousFrom, to: previousTo } };
    const previousStories = this.storiesByDate(previousFilter);

    const previousTotals = this.buildTotals(
      this.buildSeries({
        from: previousFrom,
        to: previousTo,
        granularity,
        storiesByDate: previousStories,
        mediaByDate: this.data.countMediaByDate(previousFilter),
        metrics: this.data.findDailyMetrics(previousFilter),
        snapshots: this.data.findSnapshots(previousFilter),
        snapshotsBefore: this.data.findSnapshotBefore(accountIds, previousFrom),
        profileOnly,
        accountIds,
      }),
      previousFrom,
      previousTo,
      previousStories,
      accountIds,
    );

    return {
      from,
      to,
      granularity,
      accounts,
      series,
      totals,
      previousTotals,
      stories: this.data.findStories({ ...filter, limit: 500 }),
      media: this.data.findMedia({ ...filter, limit: 200 }),
      firstStoryDate: this.data.findFirstStoryDate(accountIds),
      dailyMetrics: metrics,
    };
  }

  /**
   * Les stories de chaque jour : celles archivées par l'API Graph **et** celles déclarées
   * à la main (`ig_story_log`). On garde le **plus grand** des deux par jour, jamais la
   * somme : le jour où la collecte Graph reviendra, une journée saisie et collectée ne doit
   * pas compter chaque story deux fois.
   */
  private storiesByDate(filter: {
    accountIds: string[];
    range: { from: IsoDate; to: IsoDate };
  }): Map<IsoDate, number> {
    const merged = this.data.countStoriesByDate(filter);
    for (const [date, count] of this.data.manualStoriesByDate(filter.range)) {
      merged.set(date, Math.max(merged.get(date) ?? 0, count));
    }
    return merged;
  }

  private buildSeries(input: {
    from: IsoDate;
    to: IsoDate;
    granularity: Granularity;
    storiesByDate: Map<IsoDate, number>;
    mediaByDate: Map<IsoDate, number>;
    metrics: ReturnType<InstagramDataRepository['findDailyMetrics']>;
    snapshots: ReturnType<InstagramDataRepository['findSnapshots']>;
    snapshotsBefore: ReturnType<InstagramDataRepository['findSnapshotBefore']>;
    profileOnly: Set<string>;
    accountIds: string[];
  }): InstagramSeriesPoint[] {
    const buckets = enumerateBuckets(input.from, input.to, input.granularity);
    const byBucket = new Map<IsoDate, InstagramSeriesPoint>();
    for (const bucket of buckets) {
      byBucket.set(bucket, {
        date: bucket,
        stories: 0,
        posts: 0,
        reach: null,
        views: null,
        totalInteractions: null,
        followers: null,
        followersGained: null,
      });
    }

    const add = (target: number | null, value: number | null): number | null =>
      value === null ? target : (target ?? 0) + value;

    for (const [date, count] of input.storiesByDate) {
      const point = byBucket.get(bucketStart(date, input.granularity));
      if (point) point.stories += count;
    }
    for (const [date, count] of input.mediaByDate) {
      const point = byBucket.get(bucketStart(date, input.granularity));
      if (point) point.posts += count;
    }

    // Un compte relevé par son seul profil public n'a aucune publication archivée : ses
    // parutions se lisent dans la progression de son compteur, d'un relevé au suivant —
    // CUMUL ramené en FLUX, comme `video_stat_snapshots`. Planché à zéro : une publication
    // supprimée ne fait pas une parution négative. Le premier relevé connu ne compte rien,
    // faute de point de départ (les relevés arrivent triés par date).
    const lastMediaCount = new Map<string, number>();
    for (const snapshot of input.snapshotsBefore) {
      if (snapshot.mediaCount !== null) lastMediaCount.set(snapshot.accountId, snapshot.mediaCount);
    }
    for (const snapshot of input.snapshots) {
      if (!input.profileOnly.has(snapshot.accountId) || snapshot.mediaCount === null) continue;
      const previous = lastMediaCount.get(snapshot.accountId);
      lastMediaCount.set(snapshot.accountId, snapshot.mediaCount);
      if (previous === undefined) continue;
      const point = byBucket.get(bucketStart(snapshot.date, input.granularity));
      if (point) point.posts += Math.max(0, snapshot.mediaCount - previous);
    }

    for (const metric of input.metrics) {
      const point = byBucket.get(bucketStart(metric.date, input.granularity));
      if (!point) continue;
      point.reach = add(point.reach, metric.reach);
      point.views = add(point.views, metric.views);
      point.totalInteractions = add(point.totalInteractions, metric.totalInteractions);
    }

    // Les abonnés sont un CUMUL : dans un bucket on garde le DERNIER relevé de chaque
    // compte, puis on somme entre comptes. Les additionner jour à jour donnerait des
    // dizaines de milliers d'abonnés pour une semaine.
    const lastPerBucket = new Map<IsoDate, Map<string, number>>();
    for (const snapshot of input.snapshots) {
      if (snapshot.followersCount === null) continue;
      const bucket = bucketStart(snapshot.date, input.granularity);
      const perAccount = lastPerBucket.get(bucket) ?? new Map<string, number>();
      perAccount.set(snapshot.accountId, snapshot.followersCount);
      lastPerBucket.set(bucket, perAccount);
    }
    for (const [bucket, perAccount] of lastPerBucket) {
      const point = byBucket.get(bucket);
      if (!point) continue;
      point.followers = [...perAccount.values()].reduce((sum, value) => sum + value, 0);
    }

    const series = buckets.map((bucket) => byBucket.get(bucket)!);

    // Report de la dernière valeur connue : un bucket sans relevé ne doit pas faire
    // tomber la courbe d'abonnés à zéro. Même règle que `applyCumulativeTotals`.
    let carried: number | null = null;
    let previous: number | null = null;
    for (const point of series) {
      if (point.followers === null) point.followers = carried;
      else carried = point.followers;

      point.followersGained =
        point.followers !== null && previous !== null ? point.followers - previous : null;
      if (point.followers !== null) previous = point.followers;
    }

    return series;
  }

  /**
   * Les totaux.
   *
   * `storiesPerDay` rapporte au **nombre de jours de la période**, pas aux jours où l'on a
   * publié : « 2,4 stories par jour » se compare d'un mois à l'autre, « 4 stories les
   * jours où j'en poste » ne dit rien du rythme. `activeDays` reste exposé à côté, pour
   * qui veut la seconde lecture.
   */
  private buildTotals(
    series: InstagramSeriesPoint[],
    from: IsoDate,
    to: IsoDate,
    storiesByDate: Map<IsoDate, number>,
    accountIds: string[],
  ): InstagramTotals {
    const sum = (pick: (point: InstagramSeriesPoint) => number | null): number | null => {
      let total: number | null = null;
      for (const point of series) {
        const value = pick(point);
        if (value !== null) total = (total ?? 0) + value;
      }
      return total;
    };

    const days = Math.max(1, daysBetween(from, to) + 1);
    const stories = series.reduce((acc, point) => acc + point.stories, 0);

    // Le gain d'abonnés se mesure entre le dernier relevé de la période et celui qui la
    // précède : sans point de départ, on ne saurait pas si 1 200 abonnés est un gain de
    // 10 ou de 400.
    const before = this.data.findSnapshotBefore(accountIds, from);
    const start = before.reduce<number | null>(
      (acc, snapshot) =>
        snapshot.followersCount === null ? acc : (acc ?? 0) + snapshot.followersCount,
      null,
    );
    const followers =
      [...series].reverse().find((point) => point.followers !== null)?.followers ?? null;

    return {
      stories,
      posts: series.reduce((acc, point) => acc + point.posts, 0),
      reach: sum((point) => point.reach),
      views: sum((point) => point.views),
      totalInteractions: sum((point) => point.totalInteractions),
      followers,
      followersGained: followers !== null && start !== null ? followers - start : null,
      storiesPerDay: Math.round((stories / days) * 10) / 10,
      storiesPerWeek: Math.round((stories / days) * 7 * 10) / 10,
      activeDays: [...storiesByDate.values()].filter((count) => count > 0).length,
      days,
    };
  }
}

const daysBetween = (from: IsoDate, to: IsoDate): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
