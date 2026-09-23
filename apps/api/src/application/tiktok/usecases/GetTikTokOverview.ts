import type {
  TikTokOverview,
  TikTokSeriesPoint,
  TikTokTotals,
} from '../../../domain/tiktok/entities/TikTokOverview.ts';
import type {
  TikTokAccountRepository,
  TikTokDataRepository,
} from '../../../domain/tiktok/repositories/TikTokRepository.ts';
import {
  addDays,
  bucketStart,
  enumerateBuckets,
  type Granularity,
  type IsoDate,
} from '../../../shared/dates.ts';

export interface TikTokQuery {
  from: IsoDate;
  to: IsoDate;
  granularity: Granularity;
  accountIds: string[];
}

/**
 * L'écran TikTok, en une requête — version réduite de `GetInstagramOverview` : pas de
 * stories ni de compteurs quotidiens, TikTok n'offrant que son profil public.
 */
export class GetTikTokOverview {
  private readonly accounts: TikTokAccountRepository;
  private readonly data: TikTokDataRepository;

  constructor(accounts: TikTokAccountRepository, data: TikTokDataRepository) {
    this.accounts = accounts;
    this.data = data;
  }

  execute(query: TikTokQuery): TikTokOverview {
    const { from, to, granularity, accountIds } = query;
    const filter = { accountIds, range: { from, to } };

    const series = this.buildSeries({
      from,
      to,
      granularity,
      videosByDate: this.data.countVideosByDate(filter),
      snapshots: this.data.findSnapshots(filter),
      snapshotsBefore: this.data.findSnapshotBefore(accountIds, from),
    });
    const totals = this.buildTotals(series, from, to, accountIds);

    const spanDays = Math.max(1, daysBetween(from, to) + 1);
    const previousTo = addDays(from, -1);
    const previousFrom = addDays(previousTo, -(spanDays - 1));
    const previousFilter = { accountIds, range: { from: previousFrom, to: previousTo } };
    const previousSeries = this.buildSeries({
      from: previousFrom,
      to: previousTo,
      granularity,
      videosByDate: this.data.countVideosByDate(previousFilter),
      snapshots: this.data.findSnapshots(previousFilter),
      snapshotsBefore: this.data.findSnapshotBefore(accountIds, previousFrom),
    });
    const previousTotals = this.buildTotals(previousSeries, previousFrom, previousTo, accountIds);

    return {
      from,
      to,
      granularity,
      accounts: this.accounts.findAll(),
      series,
      totals,
      previousTotals,
      videos: this.data.findVideos({ ...filter, limit: 100 }),
    };
  }

  private buildSeries(input: {
    from: IsoDate;
    to: IsoDate;
    granularity: Granularity;
    videosByDate: Map<IsoDate, number>;
    snapshots: ReturnType<TikTokDataRepository['findSnapshots']>;
    snapshotsBefore: ReturnType<TikTokDataRepository['findSnapshotBefore']>;
  }): TikTokSeriesPoint[] {
    const buckets = enumerateBuckets(input.from, input.to, input.granularity);
    const byBucket = new Map<IsoDate, TikTokSeriesPoint>();
    for (const bucket of buckets) {
      byBucket.set(bucket, {
        date: bucket,
        videos: 0,
        followers: null,
        followersGained: null,
        hearts: null,
      });
    }

    for (const [date, count] of input.videosByDate) {
      const point = byBucket.get(bucketStart(date, input.granularity));
      if (point) point.videos += count;
    }

    // Abonnés et coeurs sont des CUMULS : dans un bucket on garde le DERNIER relevé de
    // chaque compte, puis on somme entre comptes. Même mécanique que la série Instagram.
    const lastFollowersPerBucket = new Map<IsoDate, Map<string, number>>();
    const lastHeartsPerBucket = new Map<IsoDate, Map<string, number>>();
    for (const snapshot of input.snapshots) {
      const bucket = bucketStart(snapshot.date, input.granularity);
      if (snapshot.followersCount !== null) {
        const perAccount = lastFollowersPerBucket.get(bucket) ?? new Map<string, number>();
        perAccount.set(snapshot.accountId, snapshot.followersCount);
        lastFollowersPerBucket.set(bucket, perAccount);
      }
      if (snapshot.heartCount !== null) {
        const perAccount = lastHeartsPerBucket.get(bucket) ?? new Map<string, number>();
        perAccount.set(snapshot.accountId, snapshot.heartCount);
        lastHeartsPerBucket.set(bucket, perAccount);
      }
    }
    for (const [bucket, perAccount] of lastFollowersPerBucket) {
      const point = byBucket.get(bucket);
      if (point) point.followers = [...perAccount.values()].reduce((sum, v) => sum + v, 0);
    }
    for (const [bucket, perAccount] of lastHeartsPerBucket) {
      const point = byBucket.get(bucket);
      if (point) point.hearts = [...perAccount.values()].reduce((sum, v) => sum + v, 0);
    }

    const series = buckets.map((bucket) => byBucket.get(bucket)!);

    // Report de la dernière valeur connue, plus gain jour à jour — même règle que
    // `applyCumulativeTotals` et `GetInstagramOverview.buildSeries`.
    let carriedFollowers: number | null = null;
    let carriedHearts: number | null = null;
    let previousFollowers: number | null = null;
    for (const point of series) {
      if (point.followers === null) point.followers = carriedFollowers;
      else carriedFollowers = point.followers;
      if (point.hearts === null) point.hearts = carriedHearts;
      else carriedHearts = point.hearts;

      point.followersGained =
        point.followers !== null && previousFollowers !== null
          ? point.followers - previousFollowers
          : null;
      if (point.followers !== null) previousFollowers = point.followers;
    }

    return series;
  }

  private buildTotals(
    series: TikTokSeriesPoint[],
    from: IsoDate,
    to: IsoDate,
    accountIds: string[],
  ): TikTokTotals {
    const before = this.data.findSnapshotBefore(accountIds, from);
    const start = before.reduce<number | null>(
      (acc, snapshot) =>
        snapshot.followersCount === null ? acc : (acc ?? 0) + snapshot.followersCount,
      null,
    );
    const followers =
      [...series].reverse().find((point) => point.followers !== null)?.followers ?? null;
    const hearts = [...series].reverse().find((point) => point.hearts !== null)?.hearts ?? null;

    return {
      videos: series.reduce((sum, point) => sum + point.videos, 0),
      followers,
      followersGained: followers !== null && start !== null ? followers - start : null,
      hearts,
      days: Math.max(1, daysBetween(from, to) + 1),
    };
  }
}

const daysBetween = (from: IsoDate, to: IsoDate): number =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
