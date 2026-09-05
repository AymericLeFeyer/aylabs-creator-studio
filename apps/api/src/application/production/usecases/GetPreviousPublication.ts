import { badRequest, notFound } from '../../../shared/errors.ts';
import type { ChannelRepository } from '../../../domain/channel/repositories/ChannelRepository.ts';
import type { ProductionRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
import type { VideoRepository } from '../../../domain/video/repositories/VideoRepository.ts';
import { YouTubeDataClient } from '../../../infrastructure/youtube/api/YouTubeDataClient.ts';
import { YouTubeAnalyticsClient } from '../../../infrastructure/youtube/api/YouTubeAnalyticsClient.ts';

export interface PreviousPublicationConfig {
  youtubeApiKey: string | null;
  gcpClientId: string | null;
  gcpClientSecret: string | null;
}

/** La fiche de mise en ligne de la sortie précédente, telle qu'elle est sur YouTube. */
export interface PreviousPublication {
  videoId: string;
  externalId: string;
  title: string;
  publishedAt: string;
  date: string;
  description: string;
  tags: string[];
}

/**
 * « Reprends la description de ma vidéo d'avant. »
 *
 * Une description de chaîne est un gabarit : liens d'affiliation, réseaux, chapitres,
 * mentions légales. On la réécrit à 90 % identique à chaque sortie, et la retaper de
 * mémoire est le meilleur moyen d'oublier un lien. Le geste n'est donc pas « générer une
 * description » mais **repartir de la dernière**, quitte à en changer les trois lignes du
 * haut.
 *
 * Le texte est lu **en direct sur YouTube**, jamais en base. Le stocker à la collecte
 * ferait grossir la base pour une donnée lue une fois par publication, et surtout il
 * n'existerait que pour les vidéos parues après la migration — la fenêtre de collecte ne
 * remonte qu'à la dernière vidéo connue moins sept jours. Le bouton aurait paru cassé
 * pendant des mois sur un catalogue pourtant complet.
 */
export class GetPreviousPublication {
  private readonly productions: ProductionRepository;
  private readonly videos: VideoRepository;
  private readonly channels: ChannelRepository;
  private readonly config: PreviousPublicationConfig;

  constructor(
    productions: ProductionRepository,
    videos: VideoRepository,
    channels: ChannelRepository,
    config: PreviousPublicationConfig,
  ) {
    this.productions = productions;
    this.videos = videos;
    this.channels = channels;
    this.config = config;
  }

  /** `null` quand la chaîne n'a encore aucune autre sortie connue. */
  async execute(productionId: string): Promise<PreviousPublication | null> {
    const production = this.productions.findById(productionId);
    if (!production) throw notFound('Vidéo');

    // Sans chaîne, « la vidéo précédente » ne désigne rien : deux chaînes n'ont ni le
    // même gabarit de description, ni les mêmes liens.
    const channelId = production.channelId;
    if (!channelId) {
      throw badRequest(
        'Renseigne d’abord la chaîne de cette vidéo : la description à reprendre en dépend.',
      );
    }

    const channel = this.channels.findById(channelId);
    if (!channel) throw notFound('Chaîne');

    // `findAllWithChannel` et **pas** `findAll` : le premier trie de la plus récente à la
    // plus ancienne, le second de la plus ancienne à la plus récente (il alimente les
    // repères chronologiques des graphiques). Se tromper de méthode ici rapportait la
    // toute première vidéo de la chaîne — une description vieille de deux ans.
    //
    // On saute la sortie de cette production : republier une vidéo ne consiste pas à
    // recopier sa propre fiche.
    const previous = this.videos
      .findAllWithChannel({ channelIds: [channelId], limit: 5 })
      .find((video) => video.id !== production.videoId);
    if (!previous) return null;

    const snippet = await this.fetchSnippet(
      channel.mode,
      channel.refreshToken,
      previous.externalId,
    );
    // YouTube ne connaît plus la vidéo (retirée entre deux collectes) : mieux vaut ne
    // rien proposer qu'un formulaire prérempli de vide.
    if (!snippet) return null;

    return {
      videoId: previous.id,
      externalId: previous.externalId,
      title: snippet.title || previous.title,
      publishedAt: previous.publishedAt,
      date: previous.date,
      description: snippet.description,
      tags: snippet.tags,
    };
  }

  /**
   * Le jeton de la chaîne d'abord, la clé API en repli.
   *
   * L'OAuth est le seul chemin qui voie une vidéo **non listée** — et une sortie
   * programmée en est une. La clé partagée dépanne les chaînes suivies en mode public,
   * qui n'ont de toute façon que des vidéos publiques.
   */
  private async fetchSnippet(
    mode: string,
    refreshToken: string | null,
    externalId: string,
  ): Promise<{ title: string; description: string; tags: string[] } | null> {
    if (
      mode === 'oauth' &&
      refreshToken &&
      this.config.gcpClientId &&
      this.config.gcpClientSecret
    ) {
      const client = new YouTubeAnalyticsClient({
        clientId: this.config.gcpClientId,
        clientSecret: this.config.gcpClientSecret,
        refreshToken,
      });
      return client.fetchVideoSnippet(externalId);
    }

    if (!this.config.youtubeApiKey) {
      throw badRequest(
        'Aucun accès YouTube configuré pour cette chaîne : ajoute un jeton OAuth ou une clé API.',
      );
    }
    return new YouTubeDataClient(this.config.youtubeApiKey).fetchVideoSnippet(externalId);
  }
}
