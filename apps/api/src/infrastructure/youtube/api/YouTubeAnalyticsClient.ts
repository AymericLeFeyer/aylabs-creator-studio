import { google } from 'googleapis';
import type { IsoDate } from '../../../shared/dates.ts';
import { toCents } from '../../../shared/money.ts';
import type { DailyMetric } from '../../../domain/metrics/entities/DailyMetric.ts';
import { upstream } from '../../../shared/errors.ts';
import { fetchUploads, type UploadItem } from './uploads.ts';

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
