import { google } from 'googleapis';
import type { IsoDate } from '../../../shared/dates.ts';
import { toCents } from '../../../shared/money.ts';
import type { DailyMetric } from '../../../domain/metrics/entities/DailyMetric.ts';
import { upstream } from '../../../shared/errors.ts';
import { fetchUploads, type UploadItem } from './uploads.ts';
import type { VideoStatRow } from './videoStats.ts';

/** Métriques demandées quand la chaîne est monétisée (scope monetary accordé). */
const MONETARY_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'subscribersGained',
  'subscribersLost',
  'likes',
  'comments',
  'shares',
  'estimatedRevenue',
].join(',');

/** Repli sans données d'argent, si le scope monetary est absent ou la chaîne non monétisée. */
const BASIC_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'averageViewDuration',
  'subscribersGained',
  'subscribersLost',
  'likes',
  'comments',
  'shares',
].join(',');

/** Métriques par vidéo, dans l'ordre attendu par `mapVideoRows`. */
const VIDEO_MONETARY_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'subscribersGained',
  'likes',
  'comments',
  'estimatedRevenue',
].join(',');

const VIDEO_BASIC_METRICS = [
  'views',
  'estimatedMinutesWatched',
  'subscribersGained',
  'likes',
  'comments',
].join(',');

/** `filters=video==` plafonne à 500 identifiants ; on garde de la marge. */
const MAX_VIDEOS_PER_QUERY = 200;

export interface AnalyticsCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export interface DailyFetchResult {
  metrics: DailyMetric[];
  /** `false` quand on a dû retomber sur les métriques sans revenu. */
  includesRevenue: boolean;
}

/**
 * Accès aux données PRIVÉES d'une chaîne via OAuth (un refresh token par chaîne).
 *
 * Contrairement au YouTube Money Exporter qui ne prend qu'une photo agrégée sur 30 jours,
 * on interroge ici avec `dimensions: 'day'`. YouTube renvoie alors une ligne par jour,
 * ce qui permet de reconstruire tout l'historique d'un coup au moment de l'ajout
 * d'une chaîne, au lieu d'attendre que le temps passe.
 */
export class YouTubeAnalyticsClient {
  private readonly credentials: AnalyticsCredentials;

  constructor(credentials: AnalyticsCredentials) {
    this.credentials = credentials;
  }

  private buildAuth() {
    const auth = new google.auth.OAuth2(this.credentials.clientId, this.credentials.clientSecret);
    auth.setCredentials({ refresh_token: this.credentials.refreshToken });
    return auth;
  }

  /** Totaux cumulés de la chaîne du compte authentifié (compte d'abonnés exact). */
  async getChannelTotals(): Promise<{
    channelId: string;
    title: string;
    /** Miniature de la chaîne, pour le sélecteur de l'en-tête. */
    thumbnailUrl: string | null;
    subscribers: number;
    totalViews: number;
    totalVideos: number;
  }> {
    try {
      const youtube = google.youtube({ version: 'v3', auth: this.buildAuth() });
      const response = await youtube.channels.list({
        part: ['snippet', 'statistics'],
        mine: true,
      });

      const item = response.data.items?.[0];
      if (!item) throw upstream('Aucune chaîne associée à ce refresh token');

      return {
        channelId: item.id ?? '',
        title: item.snippet?.title ?? '',
        // Une seule taille stockée : `medium` (240 px) reste net en 24 comme en 40 px.
        thumbnailUrl:
          item.snippet?.thumbnails?.medium?.url ??
          item.snippet?.thumbnails?.high?.url ??
          item.snippet?.thumbnails?.default?.url ??
          null,
        subscribers: Number(item.statistics?.subscriberCount ?? 0),
        totalViews: Number(item.statistics?.viewCount ?? 0),
        totalVideos: Number(item.statistics?.videoCount ?? 0),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') throw error;
      throw upstream(`YouTube Analytics (auth) : ${this.describe(error)}`);
    }
  }

  /** Vidéos publiées depuis `since` sur la chaîne du token. */
  async fetchUploads(since: IsoDate): Promise<UploadItem[]> {
    try {
      const youtube = google.youtube({ version: 'v3', auth: this.buildAuth() });
      return await fetchUploads(youtube, { mine: true, since });
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') throw error;
      throw upstream(`YouTube Data API (vidéos) : ${this.describe(error)}`);
    }
  }

  /**
   * Récupère les métriques jour par jour entre deux dates.
   *
   * Les revenus sont tentés en premier ; si l'API refuse (chaîne non monétisée ou
   * scope `yt-analytics-monetary.readonly` non accordé), on relance sans eux plutôt
   * que de perdre aussi les vues et les abonnés.
   */
  async fetchDailyMetrics(
    channelId: string,
    from: IsoDate,
    to: IsoDate,
  ): Promise<DailyFetchResult> {
    try {
      const rows = await this.query(MONETARY_METRICS, from, to);
      return { metrics: this.mapRows(channelId, rows, true), includesRevenue: true };
    } catch (error) {
      console.warn(
        `[youtube] revenus indisponibles pour ${channelId} (${this.describe(error)}), repli sans montants`,
      );
      try {
        const rows = await this.query(BASIC_METRICS, from, to);
        return { metrics: this.mapRows(channelId, rows, false), includesRevenue: false };
      } catch (fallbackError) {
        throw upstream(`YouTube Analytics : ${this.describe(fallbackError)}`);
      }
    }
  }

  /**
   * Compteurs par vidéo entre deux dates, pour le tableau de performance.
   *
   * La plage sert de fenêtre d'attribution : en partant du jour de sortie de la plus
   * ancienne vidéo du lot, chaque ligne cumule tout ce que la vidéo a fait depuis sa
   * publication. Comme pour les séries quotidiennes, les revenus sont tentés d'abord
   * puis abandonnés proprement si le scope monetary manque.
   */
  async fetchVideoStats(videoIds: string[], from: IsoDate, to: IsoDate): Promise<VideoStatRow[]> {
    const rows: VideoStatRow[] = [];

    for (let offset = 0; offset < videoIds.length; offset += MAX_VIDEOS_PER_QUERY) {
      const batch = videoIds.slice(offset, offset + MAX_VIDEOS_PER_QUERY);
      try {
        rows.push(
          ...this.mapVideoRows(
            await this.queryVideos(VIDEO_MONETARY_METRICS, batch, from, to),
            true,
          ),
        );
      } catch (error) {
        console.warn(
          `[youtube] revenus par vidéo indisponibles (${this.describe(error)}), repli sans montants`,
        );
        rows.push(
          ...this.mapVideoRows(await this.queryVideos(VIDEO_BASIC_METRICS, batch, from, to), false),
        );
      }
    }

    return rows;
  }

  private async queryVideos(
    metrics: string,
    videoIds: string[],
    from: IsoDate,
    to: IsoDate,
  ): Promise<unknown[][]> {
    const analytics = google.youtubeAnalytics({ version: 'v2', auth: this.buildAuth() });
    const response = await analytics.reports.query({
      ids: 'channel==MINE',
      startDate: from,
      endDate: to,
      metrics,
      dimensions: 'video',
      filters: `video==${videoIds.join(',')}`,
      maxResults: MAX_VIDEOS_PER_QUERY,
      sort: '-views',
    });
    return (response.data.rows ?? []) as unknown[][];
  }

  /** `[videoId, views, minutes, subscribersGained, likes, comments, revenue?]`. */
  private mapVideoRows(rows: unknown[][], withRevenue: boolean): VideoStatRow[] {
    const num = (value: unknown): number => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    return rows
      .filter((row) => typeof row[0] === 'string')
      .map((row) => ({
        externalId: row[0] as string,
        views: num(row[1]),
        watchMinutes: num(row[2]),
        subscribersGained: num(row[3]),
        likes: num(row[4]),
        comments: num(row[5]),
        estimatedRevenueCents: withRevenue ? toCents(num(row[6])) : 0,
      }));
  }

  private async query(metrics: string, from: IsoDate, to: IsoDate): Promise<unknown[][]> {
    const analytics = google.youtubeAnalytics({ version: 'v2', auth: this.buildAuth() });
    const response = await analytics.reports.query({
      ids: 'channel==MINE',
      startDate: from,
      endDate: to,
      metrics,
      dimensions: 'day',
      sort: 'day',
    });
    return (response.data.rows ?? []) as unknown[][];
  }

  /**
   * Une ligne = `[day, views, minutes, avgDuration, gained, lost, likes, comments, shares, revenue?]`.
   * L'ordre suit celui demandé dans `metrics`, jamais des clés nommées : d'où l'indexation positionnelle.
   */
  private mapRows(channelId: string, rows: unknown[][], withRevenue: boolean): DailyMetric[] {
    const num = (value: unknown): number => {
      const n = Number(value);
      return Number.isFinite(n) ? n : 0;
    };

    return rows
      .filter((row) => typeof row[0] === 'string')
      .map((row) => ({
        channelId,
        date: row[0] as IsoDate,
        views: num(row[1]),
        watchMinutes: num(row[2]),
        averageViewDurationSec: num(row[3]),
        subscribersGained: num(row[4]),
        subscribersLost: num(row[5]),
        likes: num(row[6]),
        comments: num(row[7]),
        shares: num(row[8]),
        estimatedRevenueCents: withRevenue ? toCents(num(row[9])) : 0,
        source: 'youtube_analytics' as const,
      }));
  }

  /** Les erreurs googleapis cachent le vrai message dans `response.data.error.message`. */
  private describe(error: unknown): string {
    const anyError = error as {
      response?: {
        data?: {
          error?: string | { message?: string };
          error_description?: string;
        };
      };
      message?: string;
    };
    const data = anyError?.response?.data;
    // Erreur d'API : `{ error: { message } }`. Erreur du endpoint OAuth : `{ error, error_description }`.
    if (data?.error && typeof data.error === 'object' && data.error.message) {
      return data.error.message;
    }
    if (typeof data?.error === 'string') {
      return data.error_description ? `${data.error} (${data.error_description})` : data.error;
    }
    return anyError?.message ?? 'erreur inconnue';
  }
}
