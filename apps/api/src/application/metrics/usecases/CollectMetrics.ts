import type { IsoDate } from '../../../shared/dates.ts';
import { addDays, today, toIsoDate } from '../../../shared/dates.ts';
import type { Channel, CollectResult } from '../../../domain/channel/entities/Channel.ts';
import type { ChannelRepository } from '../../../domain/channel/repositories/ChannelRepository.ts';
import type { MetricsRepository } from '../../../domain/metrics/repositories/MetricsRepository.ts';
import type { DailyMetric } from '../../../domain/metrics/entities/DailyMetric.ts';
import type { VideoRepository } from '../../../domain/video/repositories/VideoRepository.ts';
import type { UploadItem } from '../../../infrastructure/youtube/api/uploads.ts';
import type { VideoStatRow } from '../../../infrastructure/youtube/api/videoStats.ts';
import { YouTubeDataClient } from '../../../infrastructure/youtube/api/YouTubeDataClient.ts';
import { YouTubeAnalyticsClient } from '../../../infrastructure/youtube/api/YouTubeAnalyticsClient.ts';

export interface CollectConfig {
  youtubeApiKey: string | null;
  gcpClientId: string | null;
  gcpClientSecret: string | null;
  /** Profondeur du rattrapage initial quand une chaîne n'a encore aucune donnée. */
  backfillDays: number;
}

/**
 * YouTube révise ses chiffres pendant environ 72 h après coup (spam, vues invalidées,
 * revenus consolidés). On re-collecte donc toujours les derniers jours déjà connus
 * au lieu de repartir du lendemain de la dernière date stockée.
 */
const REVISION_WINDOW_DAYS = 4;

/** Découpage des requêtes Analytics : au-delà, l'API tronque ou refuse la réponse. */
const MAX_DAYS_PER_QUERY = 365;

/** Marge de re-lecture de la playlist d'uploads, pour rattraper une date corrigée. */
const VIDEO_REVISION_WINDOW_DAYS = 7;

/**
 * Profondeur de rafraîchissement des compteurs par vidéo. Au-delà d'un an, une vidéo
 * ne bouge plus assez pour justifier le quota d'un appel supplémentaire à chaque heure.
 */
const VIDEO_STATS_WINDOW_DAYS = 365;

export class CollectMetrics {
  private readonly channels: ChannelRepository;
  private readonly metrics: MetricsRepository;
  private readonly videos: VideoRepository;
  private readonly config: CollectConfig;

  constructor(
    channels: ChannelRepository,
    metrics: MetricsRepository,
    videos: VideoRepository,
    config: CollectConfig,
  ) {
    this.channels = channels;
    this.metrics = metrics;
    this.videos = videos;
    this.config = config;
  }

  /** Collecte toutes les chaînes actives. Une chaîne en erreur n'interrompt pas les autres. */
  async collectAll(): Promise<CollectResult[]> {
    const results: CollectResult[] = [];
    for (const channel of this.channels.findAll()) {
      results.push(await this.collectChannel(channel));
    }
    return results;
  }

  async collectById(channelId: string): Promise<CollectResult> {
    const channel = this.channels.findById(channelId);
    if (!channel) {
      return { channelId, channelName: '?', status: 'error', message: 'Chaîne introuvable' };
    }
    return this.collectChannel(channel);
  }

  private async collectChannel(channel: Channel): Promise<CollectResult> {
    const base = { channelId: channel.id, channelName: channel.name };

    try {
      if (channel.mode === 'manual') {
        return { ...base, status: 'skipped', message: 'Chaîne en saisie manuelle' };
      }
      if (channel.mode === 'oauth') return await this.collectViaOAuth(channel);
      return await this.collectViaPublicApi(channel);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[collect] ${channel.name} : ${message}`);
      return { ...base, status: 'error', message };
    }
  }

  /** Mode OAuth : abonnés exacts + historique jour par jour, revenus AdSense compris. */
  private async collectViaOAuth(channel: Channel): Promise<CollectResult> {
    const base = { channelId: channel.id, channelName: channel.name };

    if (!channel.refreshToken) {
      return { ...base, status: 'error', message: 'Refresh token manquant sur cette chaîne' };
    }
    if (!this.config.gcpClientId || !this.config.gcpClientSecret) {
      return {
        ...base,
        status: 'error',
        message: 'GCP_CLIENT_ID / GCP_CLIENT_SECRET absents de la configuration',
      };
    }

    const client = new YouTubeAnalyticsClient({
      clientId: this.config.gcpClientId,
      clientSecret: this.config.gcpClientSecret,
      refreshToken: channel.refreshToken,
    });

    const totals = await client.getChannelTotals();

    // `channel==MINE` interroge la chaîne du compte qui a accordé le token, pas celle
    // qu'on croit suivre. Un token créé sur le compte personnel plutôt que sur la chaîne
    // de marque renvoie une chaîne vide : sans ce garde-fou, on écraserait des mois de
    // données par des zéros en rapportant « ok ».
    if (channel.externalId && totals.channelId && totals.channelId !== channel.externalId) {
      return {
        ...base,
        status: 'error',
        message:
          `Le refresh token donne accès à « ${totals.title} » (${totals.channelId}), ` +
          `pas à cette chaîne (${channel.externalId}). Régénère le token en sélectionnant ` +
          `la bonne chaîne dans le sélecteur de compte Google.`,
      };
    }

    const capturedAt = new Date();
    const snapshotDate = toIsoDate(capturedAt);

    this.metrics.upsertSnapshot({
      channelId: channel.id,
      date: snapshotDate,
      capturedAt: capturedAt.toISOString(),
      subscribers: totals.subscribers,
      totalViews: totals.totalViews,
      totalVideos: totals.totalVideos,
      source: 'youtube_data',
    });

    // Renseigne l'identifiant de chaîne au premier passage, et rafraîchit la miniature :
    // une chaîne qui change de logo doit le voir arriver sans ressaisie.
    const patch: { externalId?: string; thumbnailUrl?: string } = {};
    if (!channel.externalId && totals.channelId) patch.externalId = totals.channelId;
    if (totals.thumbnailUrl && totals.thumbnailUrl !== channel.thumbnailUrl) {
      patch.thumbnailUrl = totals.thumbnailUrl;
    }
    if (Object.keys(patch).length > 0) this.channels.update(channel.id, patch);

    const from = this.resolveStartDate(channel.id);
    const to = snapshotDate;
    const collected: DailyMetric[] = [];

    for (const window of this.splitRange(from, to)) {
      const result = await client.fetchDailyMetrics(channel.id, window.from, window.to);
      collected.push(...result.metrics);
    }

    // Une saisie manuelle fait autorité : la collecte ne l'écrase jamais.
    const fresh = collected.filter(
      (metric) => this.metrics.findDailyMetric(channel.id, metric.date)?.source !== 'manual',
    );
    const daysUpserted = this.metrics.upsertDailyMetrics(fresh);

    const videosUpserted = await this.collectVideos(channel.id, (since) =>
      client.fetchUploads(since),
    );
    const videoStatsUpdated = await this.collectVideoStats(channel.id, (ids, since) =>
      client.fetchVideoStats(ids, since, to),
    );

    return { ...base, status: 'ok', daysUpserted, snapshotDate, videosUpserted, videoStatsUpdated };
  }

  /**
   * Mode public : seule la clé API est nécessaire, mais on n'obtient que des totaux.
   * Les vues quotidiennes sont reconstruites par différence avec le snapshot précédent.
   */
  private async collectViaPublicApi(channel: Channel): Promise<CollectResult> {
    const base = { channelId: channel.id, channelName: channel.name };

    if (!this.config.youtubeApiKey) {
      return { ...base, status: 'error', message: 'YOUTUBE_API_KEY absente de la configuration' };
    }
    if (!channel.externalId) {
      return { ...base, status: 'error', message: 'Identifiant de chaîne YouTube manquant' };
    }

    const client = new YouTubeDataClient(this.config.youtubeApiKey);
    const stats = await client.getChannelStats(channel.externalId);

    // Même raison qu'en mode OAuth : la miniature suit la chaîne, sans ressaisie.
    if (stats.thumbnailUrl && stats.thumbnailUrl !== channel.thumbnailUrl) {
      this.channels.update(channel.id, { thumbnailUrl: stats.thumbnailUrl });
    }

    const capturedAt = new Date();
    const snapshotDate = toIsoDate(capturedAt);
    const previous = this.metrics.findLatestSnapshotAt(channel.id, addDays(snapshotDate, -1));

    this.metrics.upsertSnapshot({
      channelId: channel.id,
      date: snapshotDate,
      capturedAt: capturedAt.toISOString(),
      subscribers: stats.subscribers,
      totalViews: stats.totalViews,
      totalVideos: stats.totalVideos,
      source: 'youtube_data',
    });

    let daysUpserted = 0;
    const existing = this.metrics.findDailyMetric(channel.id, snapshotDate);

    // On ne dérive que les vues, et jamais par-dessus une saisie manuelle.
    // Un delta négatif signale une purge de vues côté YouTube : on le laisse à zéro
    // plutôt que d'inscrire un nombre de vues négatif dans la série.
    if (previous && existing?.source !== 'manual') {
      const deltaViews = stats.totalViews - previous.totalViews;
      const spanDays = Math.max(
        1,
        Math.round(
          (new Date(`${snapshotDate}T00:00:00Z`).getTime() -
            new Date(`${previous.date}T00:00:00Z`).getTime()) /
            86_400_000,
        ),
      );
      // Un trou de collecte est réparti uniformément sur les jours manquants.
      const perDay = Math.max(0, Math.round(deltaViews / spanDays));

      const derived: DailyMetric[] = [];
      for (let offset = 0; offset < spanDays; offset += 1) {
        const date = addDays(previous.date, offset + 1);
        if (date > snapshotDate) break;
        if (this.metrics.findDailyMetric(channel.id, date)?.source === 'manual') continue;
        derived.push({
          channelId: channel.id,
          date,
          views: perDay,
          watchMinutes: 0,
          averageViewDurationSec: 0,
          subscribersGained: 0,
          subscribersLost: 0,
          likes: 0,
          comments: 0,
          shares: 0,
          estimatedRevenueCents: 0,
          source: 'derived',
        });
      }
      daysUpserted = this.metrics.upsertDailyMetrics(derived);
    }

    const videosUpserted = await this.collectVideos(channel.id, (since) =>
      client.fetchUploads(channel.externalId!, since),
    );
    const videoStatsUpdated = await this.collectVideoStats(channel.id, (ids) =>
      client.fetchVideoStats(ids),
    );

    return { ...base, status: 'ok', daysUpserted, snapshotDate, videosUpserted, videoStatsUpdated };
  }

  /**
   * Enregistre les sorties de vidéo, qui servent de repères sur les graphiques.
   *
   * Une chaîne déjà parcourue ne repart pas de zéro : on ne redemande que depuis la
   * dernière vidéo connue, moins une marge — une vidéo programmée puis publiée plus
   * tôt, ou une date corrigée après coup, resterait sinon invisible.
   *
   * L'échec est **avalé volontairement** : les vidéos sont un confort d'affichage, et
   * une chaîne sans playlist publique ne doit pas faire échouer toute une collecte de
   * métriques déjà écrites.
   */
  private async collectVideos(
    channelId: string,
    fetch: (since: IsoDate) => Promise<UploadItem[]>,
  ): Promise<number> {
    const latest = this.videos.findLatestDate(channelId);
    const since = latest
      ? addDays(latest, -VIDEO_REVISION_WINDOW_DAYS)
      : addDays(today(), -this.config.backfillDays);

    try {
      const uploads = await fetch(since);
      return this.videos.upsertMany(
        uploads.map((upload) => ({
          channelId,
          externalId: upload.externalId,
          title: upload.title,
          publishedAt: upload.publishedAt,
          date: upload.date,
          thumbnailUrl: upload.thumbnailUrl,
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[collect] vidéos non collectées (${channelId}) : ${message}`);
      return 0;
    }
  }

  /**
   * Rafraîchit les compteurs des vidéos récentes de la chaîne.
   *
   * Ce sont des CUMULS depuis la sortie, jamais des flux : chaque passage remplace la
   * valeur précédente. La fenêtre part du jour de sortie de la plus ancienne vidéo du
   * lot, pour qu'aucune vue ne soit tronquée côté YouTube Analytics.
   *
   * Comme la collecte des sorties, l'échec est **avalé** : un tableau de performance
   * incomplet vaut mieux qu'une collecte de métriques annulée.
   */
  private async collectVideoStats(
    channelId: string,
    fetch: (videoIds: string[], since: IsoDate) => Promise<VideoStatRow[]>,
  ): Promise<number> {
    const to = today();
    const recent = this.videos.findAll({
      channelIds: [channelId],
      range: { from: addDays(to, -VIDEO_STATS_WINDOW_DAYS), to },
    });
    if (recent.length === 0) return 0;

    try {
      // `findAll` trie par date de publication croissante : la première est la plus ancienne.
      const stats = await fetch(
        recent.map((video) => video.externalId),
        recent[0]!.date,
      );
      return this.videos.upsertStats(
        stats.map((row) => ({
          channelId,
          externalId: row.externalId,
          stats: {
            views: row.views,
            watchMinutes: row.watchMinutes,
            subscribersGained: row.subscribersGained,
            likes: row.likes,
            comments: row.comments,
            estimatedRevenueCents: row.estimatedRevenueCents,
          },
        })),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[collect] stats vidéo non collectées (${channelId}) : ${message}`);
      return 0;
    }
  }

  /** Reprend quelques jours avant la dernière donnée connue, ou rattrape tout l'historique. */
  private resolveStartDate(channelId: string): IsoDate {
    const last = this.metrics.findLastMetricDate(channelId);
    if (!last) return addDays(today(), -this.config.backfillDays);
    return addDays(last, -REVISION_WINDOW_DAYS);
  }

  private splitRange(from: IsoDate, to: IsoDate): Array<{ from: IsoDate; to: IsoDate }> {
    const windows: Array<{ from: IsoDate; to: IsoDate }> = [];
    let cursor = from;
    let guard = 0;
    while (cursor <= to && guard++ < 50) {
      const end = addDays(cursor, MAX_DAYS_PER_QUERY - 1);
      windows.push({ from: cursor, to: end > to ? to : end });
      cursor = addDays(end, 1);
    }
    return windows;
  }
}
