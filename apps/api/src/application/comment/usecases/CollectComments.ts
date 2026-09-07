import type { Channel } from '../../../domain/channel/entities/Channel.ts';
import type { ChannelRepository } from '../../../domain/channel/repositories/ChannelRepository.ts';
import type { CommentRepository } from '../../../domain/comment/repositories/CommentRepository.ts';
import type { UpsertCommentInput } from '../../../domain/comment/entities/Comment.ts';
import type { CommentItem } from '../../../infrastructure/youtube/api/comments.ts';
import { YouTubeDataClient } from '../../../infrastructure/youtube/api/YouTubeDataClient.ts';
import { YouTubeAnalyticsClient } from '../../../infrastructure/youtube/api/YouTubeAnalyticsClient.ts';

export interface CommentCollectConfig {
  youtubeApiKey: string | null;
  gcpClientId: string | null;
  gcpClientSecret: string | null;
}

export interface CommentCollectResult {
  channelId: string;
  channelName: string;
  status: 'ok' | 'skipped' | 'error';
  /** Commentaires ramenés par l'API, doublons compris. */
  found: number;
  /** Ceux qui n'étaient pas encore archivés — ce qui arrive dans la file de tri. */
  created: number;
  /** Rattachements de vidéo rattrapés au passage. */
  linked: number;
  message?: string;
}

/**
 * La collecte des commentaires.
 *
 * **Elle est le seul moyen de les garder.** L'API ne les rend que par pages
 * antéchronologiques, sans recherche ni archive : « le commentaire qui m'avait fait
 * plaisir en mars » est introuvable en septembre. On les archive donc au fil de l'eau,
 * comme les stories Instagram — à cette différence près qu'un jour manqué se rattrape
 * ici, tant qu'on ne dépasse pas ce que la pagination peut remonter.
 *
 * **Rien de ce qui est déjà archivé n'est recréé, et surtout aucun statut n'est
 * réécrit.** C'est le dépôt qui le garantit (`upsertMany` n'insère ni ne met à jour la
 * colonne `status`) ; la collecte, elle, s'arrête simplement dès qu'elle a rejoint
 * l'historique, pour ne pas repaginer tout le catalogue à chaque passage.
 *
 * Ses propres commentaires sont **écartés** : les réponses qu'on laisse sous ses vidéos
 * remonteraient sinon dans la file de tri, où elles n'ont rien à faire.
 */
export class CollectComments {
  private readonly channels: ChannelRepository;
  private readonly comments: CommentRepository;
  private readonly config: CommentCollectConfig;

  constructor(
    channels: ChannelRepository,
    comments: CommentRepository,
    config: CommentCollectConfig,
  ) {
    this.channels = channels;
    this.comments = comments;
    this.config = config;
  }

  /** Toutes les chaînes actives. Une chaîne en erreur n'interrompt pas les autres. */
  async collectAll(): Promise<CommentCollectResult[]> {
    const results: CommentCollectResult[] = [];
    for (const channel of this.channels.findAll()) {
      results.push(await this.collectChannel(channel));
    }
    return results;
  }

  async collectById(channelId: string): Promise<CommentCollectResult> {
    const channel = this.channels.findById(channelId);
    if (!channel) {
      return {
        channelId,
        channelName: '?',
        status: 'error',
        found: 0,
        created: 0,
        linked: 0,
        message: 'Chaîne introuvable',
      };
    }
    return this.collectChannel(channel);
  }

  private async collectChannel(channel: Channel): Promise<CommentCollectResult> {
    const base = {
      channelId: channel.id,
      channelName: channel.name,
      found: 0,
      created: 0,
      linked: 0,
    };

    if (channel.mode === 'manual') {
      return { ...base, status: 'skipped', message: 'Chaîne en saisie manuelle' };
    }
    // `allThreadsRelatedToChannelId` exige un identifiant de chaîne, y compris en OAuth :
    // il n'existe pas d'équivalent `mine: true` sur les commentaires.
    if (!channel.externalId) {
      return {
        ...base,
        status: 'error',
        message: 'Identifiant de chaîne YouTube manquant (collecte des métriques d’abord)',
      };
    }

    try {
      const items = await this.fetch(channel, channel.externalId);
      const upserts = this.toUpserts(channel, items);
      const created = this.comments.upsertMany(upserts);
      const linked = this.comments.linkVideos(channel.id);

      return { ...base, status: 'ok', found: upserts.length, created, linked };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[comments] ${channel.name} : ${message}`);
      return { ...base, status: 'error', message };
    }
  }

  /**
   * Le jeton de la chaîne passe avant la clé API — même règle que la fiche de vidéo :
   * c'est le seul chemin qui voie les commentaires d'une sortie non listée.
   */
  private fetch(channel: Channel, externalId: string): Promise<CommentItem[]> {
    const isKnown = (commentId: string) => this.comments.isKnown(channel.id, commentId);

    if (channel.mode === 'oauth' && channel.refreshToken) {
      if (!this.config.gcpClientId || !this.config.gcpClientSecret) {
        throw new Error('GCP_CLIENT_ID / GCP_CLIENT_SECRET absents de la configuration');
      }
      const client = new YouTubeAnalyticsClient({
        clientId: this.config.gcpClientId,
        clientSecret: this.config.gcpClientSecret,
        refreshToken: channel.refreshToken,
      });
      return client.fetchComments({ channelId: externalId, isKnown });
    }

    if (!this.config.youtubeApiKey) {
      throw new Error('YOUTUBE_API_KEY absente de la configuration');
    }
    return new YouTubeDataClient(this.config.youtubeApiKey).fetchComments({
      channelId: externalId,
      isKnown,
    });
  }

  /**
   * Écarte ce qui n'a rien à faire dans la file de tri : ses propres commentaires, et
   * les messages vides (une réaction en emoji supprimée ne laisse parfois qu'une chaîne
   * blanche).
   */
  private toUpserts(channel: Channel, items: CommentItem[]): UpsertCommentInput[] {
    return items
      .filter((item) => item.authorChannelId !== channel.externalId)
      .filter((item) => item.text.trim().length > 0)
      .map((item) => ({
        channelId: channel.id,
        externalId: item.externalId,
        videoExternalId: item.videoExternalId,
        authorName: item.authorName,
        authorAvatarUrl: item.authorAvatarUrl,
        authorChannelId: item.authorChannelId,
        text: item.text,
        likeCount: item.likeCount,
        publishedAt: item.publishedAt,
        date: item.date,
      }));
  }
}
