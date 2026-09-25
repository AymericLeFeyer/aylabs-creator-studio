import {
  THRESHOLDS,
  type AchievementMetric,
  type AchievementPlatform,
  type AchievementRecord,
  type AchievementTrack,
  type AchievementUnit,
  type AchievementsView,
} from '../../../domain/achievement/entities/Achievement.ts';
import type {
  AchievementEntity,
  AchievementSourceRepository,
  DatedItem,
} from '../../../domain/achievement/repositories/AchievementSourceRepository.ts';
import {
  countItems,
  cumulateFlux,
  findMilestones,
  fromSnapshots,
  type Curve,
} from '../../../domain/achievement/services/milestones.ts';
import { addDays } from '../../../shared/dates.ts';

/** Programme Partenaire YouTube : 1 000 abonnés et 4 000 heures sur 12 mois glissants. */
const YPP_SUBSCRIBERS = 1_000;
const YPP_WATCH_MINUTES = 4_000 * 60;

const LABELS: Record<AchievementMetric, string> = {
  subscribers: 'Abonnés',
  followers: 'Abonnés',
  views: 'Vues',
  videos: 'Vidéos publiées',
  posts: 'Publications',
  stories: 'Stories',
  hearts: 'Coeurs',
  adsense: 'AdSense cumulé',
};

/**
 * Les achievements de toutes les chaînes et de tous les comptes, **recalculés à chaque
 * lecture** depuis l'historique : rien n'est stocké, donc rien ne peut diverger de ce que
 * disent les autres écrans, et un palier franchi hier apparaît sans écriture.
 *
 * Par entité et non cumulé entre chaînes : additionner les abonnés de deux chaînes
 * compterait deux fois la même personne (même raison que l'export), et « première vidéo »
 * n'a de sens que pour une chaîne.
 */
export class GetAchievements {
  private readonly source: AchievementSourceRepository;

  constructor(source: AchievementSourceRepository) {
    this.source = source;
  }

  execute(): AchievementsView {
    const tracks: AchievementTrack[] = [];
    const records: AchievementRecord[] = [];
    for (const channel of this.source.youtubeChannels()) this.youtube(channel, tracks, records);
    for (const account of this.source.instagramAccounts()) {
      this.instagram(account, tracks, records);
    }
    for (const account of this.source.tiktokAccounts()) this.tiktok(account, tracks, records);
    return { tracks, records };
  }

  private track(
    platform: AchievementPlatform,
    entity: AchievementEntity,
    metric: AchievementMetric,
    curve: Curve,
    partialHistory: boolean,
    unit: AchievementUnit = 'count',
  ): AchievementTrack | null {
    if (curve.points.length === 0) return null;
    return {
      id: `${platform}:${entity.id}:${metric}`,
      platform,
      entityId: entity.id,
      entityName: entity.name,
      entityColor: entity.color,
      metric,
      label: LABELS[metric],
      unit,
      current: curve.points.at(-1)!.value,
      historyStart: curve.points[0]!.date,
      partialHistory,
      series: curve.points,
      milestones: findMilestones(curve, metric, THRESHOLDS[metric]),
    };
  }

  private record(
    platform: AchievementPlatform,
    entity: AchievementEntity,
    input: Omit<
      AchievementRecord,
      'platform' | 'entityId' | 'entityName' | 'entityColor' | 'id'
    > & {
      key: string;
    },
  ): AchievementRecord {
    const { key, ...rest } = input;
    return {
      id: `${platform}:${entity.id}:${key}`,
      platform,
      entityId: entity.id,
      entityName: entity.name,
      entityColor: entity.color,
      ...rest,
    };
  }

  private youtube(
    channel: AchievementEntity,
    tracks: AchievementTrack[],
    records: AchievementRecord[],
  ) {
    const daily = this.source.youtubeDaily(channel.id);
    const snapshots = this.source.youtubeSnapshots(channel.id);
    const videos = this.source.youtubeVideos(channel.id);
    const latest = snapshots.at(-1) ?? null;
    const add = (track: AchievementTrack | null) => track && tracks.push(track);

    // Abonnés : le flux quotidien recalé sur le dernier relevé quand la chaîne le mesure
    // (OAuth), sinon les relevés eux-mêmes — une chaîne publique n'a pas de flux.
    const hasSubscriberFlux = daily.some((row) => row.hasSubscriberFlux);
    const subscribers = hasSubscriberFlux
      ? cumulateFlux(
          daily.map((row) => ({ date: row.date, delta: row.subscribersNet })),
          latest && { date: latest.date, value: latest.subscribers },
        )
      : fromSnapshots(snapshots.map((row) => ({ date: row.date, value: row.subscribers })));
    add(this.track('youtube', channel, 'subscribers', subscribers, subscribers.start > 0));

    // Vues : flux recalé sur le total public, exact (contrairement aux abonnés).
    const views = daily.length
      ? cumulateFlux(
          daily.map((row) => ({ date: row.date, delta: row.views })),
          latest && { date: latest.date, value: latest.totalViews },
        )
      : fromSnapshots(snapshots.map((row) => ({ date: row.date, value: row.totalViews })));
    add(this.track('youtube', channel, 'views', views, views.start > 0));

    // Vidéos : les sorties connues, complétées par le total annoncé pour les plus anciennes.
    const videoCurve = countItems(
      videos.map((video) => video.date),
      latest?.totalVideos ?? null,
    );
    add(this.track('youtube', channel, 'videos', videoCurve, videoCurve.start > 0));

    // AdSense : cumulé depuis le début du rattrapage. Partiel si la chaîne publiait avant.
    if (daily.some((row) => row.revenueCents > 0)) {
      const adsense = cumulateFlux(
        daily.map((row) => ({ date: row.date, delta: row.revenueCents })),
        null,
      );
      const firstVideo = videos[0]?.date ?? daily[0]!.date;
      add(this.track('youtube', channel, 'adsense', adsense, firstVideo < daily[0]!.date, 'cents'));
    }

    const bestDay = maxBy(daily, (row) => row.views);
    if (bestDay && bestDay.views > 0) {
      records.push(
        this.record('youtube', channel, {
          key: 'bestViewsDay',
          metric: 'views',
          title: 'Meilleure journée de vues',
          value: bestDay.views,
          unit: 'count',
          date: bestDay.date,
          detail: null,
        }),
      );
    }
    const bestSubs = hasSubscriberFlux ? maxBy(daily, (row) => row.subscribersNet) : null;
    if (bestSubs && bestSubs.subscribersNet > 0) {
      records.push(
        this.record('youtube', channel, {
          key: 'bestSubscribersDay',
          metric: 'subscribers',
          title: "Record d'abonnés en un jour",
          value: bestSubs.subscribersNet,
          unit: 'count',
          date: bestSubs.date,
          detail: null,
        }),
      );
    }
    const topVideo = topItem(videos);
    if (topVideo) {
      records.push(
        this.record('youtube', channel, {
          key: 'topVideo',
          metric: 'views',
          title: 'Vidéo la plus vue',
          value: topVideo.score,
          unit: 'count',
          date: topVideo.date,
          detail: topVideo.title,
        }),
      );
    }
    const ypp = hasSubscriberFlux ? partnerProgramDate(daily, subscribers) : null;
    if (ypp) {
      records.push(
        this.record('youtube', channel, {
          key: 'partnerProgram',
          metric: 'subscribers',
          title: 'Seuils du Programme Partenaire',
          value: null,
          unit: 'count',
          date: ypp,
          detail: '1 000 abonnés et 4 000 heures de visionnage sur 12 mois',
        }),
      );
    }
  }

  private instagram(
    account: AchievementEntity,
    tracks: AchievementTrack[],
    records: AchievementRecord[],
  ) {
    const snapshots = this.source.instagramSnapshots(account.id);
    const media = this.source.instagramMedia(account.id);
    const stories = this.source.instagramStoryDates(account.id);
    const add = (track: AchievementTrack | null) => track && tracks.push(track);

    add(
      this.track(
        'instagram',
        account,
        'followers',
        fromSnapshots(snapshots.map((row) => ({ date: row.date, value: row.followers }))),
        true,
      ),
    );
    const known = snapshots.findLast((row) => row.mediaCount !== null)?.mediaCount ?? null;
    const posts = countItems(
      media.map((item) => item.date),
      known,
    );
    add(this.track('instagram', account, 'posts', posts, posts.start > 0));
    // Les stories ne vivent que 24 h : l'historique commence toujours à la première collecte.
    add(this.track('instagram', account, 'stories', countItems(stories, null), true));

    const bestReach = maxBy(this.source.instagramReach(account.id), (row) => row.reach);
    if (bestReach && bestReach.reach > 0) {
      records.push(
        this.record('instagram', account, {
          key: 'bestReachDay',
          metric: 'views',
          title: 'Meilleure portée en un jour',
          value: bestReach.reach,
          unit: 'count',
          date: bestReach.date,
          detail: null,
        }),
      );
    }
    const storyDays = new Map<string, number>();
    for (const date of stories) storyDays.set(date, (storyDays.get(date) ?? 0) + 1);
    const bestStories = maxBy([...storyDays.entries()], ([, count]) => count);
    if (bestStories && bestStories[1] > 1) {
      records.push(
        this.record('instagram', account, {
          key: 'bestStoriesDay',
          metric: 'stories',
          title: 'Record de stories en un jour',
          value: bestStories[1],
          unit: 'count',
          date: bestStories[0],
          detail: null,
        }),
      );
    }
    const topPost = topItem(media);
    if (topPost) {
      records.push(
        this.record('instagram', account, {
          key: 'topPost',
          metric: 'views',
          title: 'Publication la plus aimée',
          value: topPost.score,
          unit: 'count',
          date: topPost.date,
          detail: topPost.title,
        }),
      );
    }
  }

  private tiktok(
    account: AchievementEntity,
    tracks: AchievementTrack[],
    records: AchievementRecord[],
  ) {
    const snapshots = this.source.tiktokSnapshots(account.id);
    const add = (track: AchievementTrack | null) => track && tracks.push(track);
    add(
      this.track(
        'tiktok',
        account,
        'followers',
        fromSnapshots(snapshots.map((row) => ({ date: row.date, value: row.followers }))),
        true,
      ),
    );
    add(
      this.track(
        'tiktok',
        account,
        'hearts',
        fromSnapshots(snapshots.map((row) => ({ date: row.date, value: row.hearts }))),
        true,
      ),
    );
    const topVideo = topItem(this.source.tiktokVideos(account.id));
    if (topVideo) {
      records.push(
        this.record('tiktok', account, {
          key: 'topVideo',
          metric: 'views',
          title: 'Vidéo la plus vue',
          value: topVideo.score,
          unit: 'count',
          date: topVideo.date,
          detail: topVideo.title,
        }),
      );
    }
  }
}

const maxBy = <T>(items: T[], pick: (item: T) => number): T | null =>
  items.reduce<T | null>(
    (best, item) => (best === null || pick(item) > pick(best) ? item : best),
    null,
  );

const topItem = (items: DatedItem[]): (DatedItem & { score: number }) | null => {
  const best = maxBy(
    items.filter((item): item is DatedItem & { score: number } => item.score !== null),
    (item) => item.score,
  );
  return best && best.score > 0 ? best : null;
};

/**
 * Le premier jour où les deux seuils du Programme Partenaire sont tenus **en même temps** :
 * 1 000 abonnés ce jour-là, et 4 000 heures regardées sur les 365 jours qui le précèdent
 * (fenêtre glissante, comme YouTube la calcule). Les Shorts ont leur propre voie, que
 * l'historique ne permet pas de mesurer.
 */
const partnerProgramDate = (
  daily: Array<{ date: string; watchMinutes: number }>,
  subscribers: Curve,
): string | null => {
  const subsAt = new Map(subscribers.points.map((point) => [point.date, point.value]));
  let windowMinutes = 0;
  let tail = 0;
  for (let index = 0; index < daily.length; index += 1) {
    const day = daily[index]!;
    windowMinutes += day.watchMinutes;
    const floor = addDays(day.date, -364);
    while (daily[tail]!.date < floor) {
      windowMinutes -= daily[tail]!.watchMinutes;
      tail += 1;
    }
    if (windowMinutes >= YPP_WATCH_MINUTES && (subsAt.get(day.date) ?? 0) >= YPP_SUBSCRIBERS) {
      return day.date;
    }
  }
  return null;
};
