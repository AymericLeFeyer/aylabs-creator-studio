import { google } from 'googleapis';
import { upstream } from '../../../shared/errors.ts';
import type { IsoDate } from '../../../shared/dates.ts';
import { fetchUploads, type UploadItem } from './uploads.ts';
import { fetchPublicVideoStats, type VideoStatRow } from './videoStats.ts';

export interface PublicChannelStats {
  channelId: string;
  title: string;
  handle: string | null;
  subscribers: number;
  totalViews: number;
  totalVideos: number;
  /** Miniature de la chaîne, `null` si YouTube n'en renvoie pas. */
  thumbnailUrl: string | null;
}

/**
 * La meilleure miniature disponible, du plus grand au plus petit format.
 * Une seule taille est stockée : l'interface l'affiche en 24 px comme en 40 px, et
 * `medium` (240 px) reste net dans les deux sans peser.
 */
const pickThumbnail = (
  thumbnails?: {
    medium?: { url?: string | null } | null;
    default?: { url?: string | null } | null;
    high?: { url?: string | null } | null;
  } | null,
): string | null =>
  thumbnails?.medium?.url ?? thumbnails?.high?.url ?? thumbnails?.default?.url ?? null;

/**
 * Accès aux données PUBLIQUES d'une chaîne via une simple clé API.
 *
 * Ne donne accès à aucune donnée de revenu : uniquement les compteurs visibles
 * par tout le monde. Suffisant pour suivre une chaîne qui ne t'appartient pas.
 *
 * Limite connue : YouTube arrondit `subscriberCount` (3 chiffres significatifs)
 * au-delà de 1000 abonnés. Les paliers sont donc grossiers sur les grosses chaînes ;
 * seul le mode OAuth donne le compte exact.
 */
export class YouTubeDataClient {
  private readonly apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private get client() {
    return google.youtube({ version: 'v3', auth: this.apiKey });
  }

  /** Récupère les stats publiques par identifiant de chaîne (UC...). */
  async getChannelStats(channelId: string): Promise<PublicChannelStats> {
    try {
      const response = await this.client.channels.list({
        part: ['snippet', 'statistics'],
        id: [channelId],
      });

      const item = response.data.items?.[0];
      if (!item) throw upstream(`Chaîne YouTube "${channelId}" introuvable`);

      return {
        channelId: item.id ?? channelId,
        title: item.snippet?.title ?? channelId,
        handle: item.snippet?.customUrl ?? null,
        subscribers: Number(item.statistics?.subscriberCount ?? 0),
        totalViews: Number(item.statistics?.viewCount ?? 0),
        totalVideos: Number(item.statistics?.videoCount ?? 0),
        thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') throw error;
      throw upstream(`YouTube Data API : ${(error as Error).message}`);
    }
  }

  /**
   * Résout un handle (@aylabs) ou une URL de chaîne en identifiant UC...
   * `forHandle` est la méthode officielle depuis 2023 ; on retombe sur une recherche
   * si le handle n'est pas reconnu (chaînes anciennes sans handle déclaré).
   */
  async resolveChannelId(input: string): Promise<PublicChannelStats> {
    const trimmed = input.trim();

    // Déjà un identifiant de chaîne.
    if (/^UC[\w-]{22}$/.test(trimmed)) return this.getChannelStats(trimmed);

    const handle = this.extractHandle(trimmed);

    try {
      if (handle) {
        const byHandle = await this.client.channels.list({
          part: ['snippet', 'statistics'],
          forHandle: handle,
        });
        const item = byHandle.data.items?.[0];
        if (item?.id) {
          return {
            channelId: item.id,
            title: item.snippet?.title ?? handle,
            handle: item.snippet?.customUrl ?? `@${handle}`,
            subscribers: Number(item.statistics?.subscriberCount ?? 0),
            totalViews: Number(item.statistics?.viewCount ?? 0),
            totalVideos: Number(item.statistics?.videoCount ?? 0),
            thumbnailUrl: pickThumbnail(item.snippet?.thumbnails),
          };
        }
      }

      const search = await this.client.search.list({
        part: ['snippet'],
        q: handle ?? trimmed,
        type: ['channel'],
        maxResults: 1,
      });
      const found = search.data.items?.[0]?.id?.channelId;
      if (!found) throw upstream(`Aucune chaîne YouTube trouvée pour "${input}"`);

      return this.getChannelStats(found);
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') throw error;
      throw upstream(`YouTube Data API : ${(error as Error).message}`);
    }
  }

  /** Vidéos publiées depuis `since`, pour poser les repères de sortie sur les graphiques. */
  async fetchUploads(channelId: string, since: IsoDate): Promise<UploadItem[]> {
    try {
      return await fetchUploads(this.client, { channelId, since });
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') throw error;
      throw upstream(`YouTube Data API (vidéos) : ${(error as Error).message}`);
    }
  }

  /**
   * Compteurs publics d'une liste de vidéos : vues, likes, commentaires.
   * Ni abonnés gagnés ni revenus — ils n'existent que dans YouTube Analytics.
   */
  async fetchVideoStats(videoIds: string[]): Promise<VideoStatRow[]> {
    try {
      return await fetchPublicVideoStats(this.client, videoIds);
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') throw error;
      throw upstream(`YouTube Data API (stats vidéo) : ${(error as Error).message}`);
    }
  }

  /** Extrait `aylabs` de `@aylabs`, `youtube.com/@aylabs` ou `https://youtube.com/@aylabs/videos`. */
  private extractHandle(input: string): string | null {
    const match = input.match(/@([\w.-]+)/);
    return match?.[1] ?? null;
  }
}
