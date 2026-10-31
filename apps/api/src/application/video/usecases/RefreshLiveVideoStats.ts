import type { Channel } from '../../../domain/channel/entities/Channel.ts';
import type { ChannelRepository } from '../../../domain/channel/repositories/ChannelRepository.ts';
import type { VideoView } from '../../../domain/video/entities/Video.ts';
import type { VideoRepository } from '../../../domain/video/repositories/VideoRepository.ts';
import { YouTubeAnalyticsClient } from '../../../infrastructure/youtube/api/YouTubeAnalyticsClient.ts';
import { YouTubeDataClient } from '../../../infrastructure/youtube/api/YouTubeDataClient.ts';
import type { VideoStatRow } from '../../../infrastructure/youtube/api/videoStats.ts';

export interface LiveVideoStatsConfig {
  youtubeApiKey: string | null;
  gcpClientId: string | null;
  gcpClientSecret: string | null;
}

export interface LiveVideoStatsQuery {
  channelIds?: string[];
  limit: number;
}

/**
 * Les dernières sorties, avec les compteurs de cette minute.
 *
 * `videos.list` est le seul chemin rapide : YouTube Analytics a plusieurs jours de retard
 * et n'expose pas le temps réel de Studio. On obtient donc vues, likes et commentaires à
 * jour, jamais les minutes vues, les abonnés gagnés ni l'AdSense.
 *
 * Coûte 1 unité de quota par chaîne, pour 50 vidéos. Une chaîne en échec garde ses derniers
 * compteurs : le rafraîchissement d'un bloc ne doit pas le vider, et `stats.updatedAt` dit
 * de quand date ce qui est affiché.
 */
export class RefreshLiveVideoStats {
  private readonly videos: VideoRepository;
  private readonly channels: ChannelRepository;
  private readonly config: LiveVideoStatsConfig;

  constructor(videos: VideoRepository, channels: ChannelRepository, config: LiveVideoStatsConfig) {
    this.videos = videos;
    this.channels = channels;
    this.config = config;
  }

  async execute(query: LiveVideoStatsQuery): Promise<VideoView[]> {
    const filter = { channelIds: query.channelIds, limit: query.limit, hidden: false };

    const byChannel = new Map<string, string[]>();
    for (const video of this.videos.findAllWithChannel(filter)) {
      byChannel.set(video.channelId, [...(byChannel.get(video.channelId) ?? []), video.externalId]);
    }

    await Promise.all(
      [...byChannel].map(async ([channelId, externalIds]) => {
        const channel = this.channels.findById(channelId);
        if (!channel) return;
        try {
          const rows = await this.fetch(channel, externalIds);
          this.videos.updateLiveStats(
            rows.map(({ externalId, views, likes, comments }) => ({
              channelId,
              externalId,
              views,
              likes,
              comments,
            })),
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[videos] relevé en direct impossible (${channelId}) : ${message}`);
        }
      }),
    );

    return this.videos.findAllWithChannel(filter);
  }

  /** Le jeton d'abord, même règle que `GetPreviousPublication`, la clé API en repli. */
  private async fetch(channel: Channel, externalIds: string[]): Promise<VideoStatRow[]> {
    const { youtubeApiKey, gcpClientId, gcpClientSecret } = this.config;

    if (channel.mode === 'oauth' && channel.refreshToken && gcpClientId && gcpClientSecret) {
      const client = new YouTubeAnalyticsClient({
        clientId: gcpClientId,
        clientSecret: gcpClientSecret,
        refreshToken: channel.refreshToken,
      });
      return client.fetchPublicVideoStats(externalIds);
    }

    if (!youtubeApiKey) return [];
    return new YouTubeDataClient(youtubeApiKey).fetchVideoStats(externalIds);
  }
}
