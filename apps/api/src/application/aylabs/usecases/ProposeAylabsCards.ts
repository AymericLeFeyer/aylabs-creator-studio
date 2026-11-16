import { badRequest, notFound } from '../../../shared/errors.ts';
import type {
  AylabsCardsProposal,
  ProductCard,
} from '../../../domain/aylabs/entities/AylabsCard.ts';
import {
  formatIsoDuration,
  parisDateTime,
  summarizeDescription,
} from '../../../domain/aylabs/services/cards.ts';
import type { ProductRepository } from '../../../domain/product/repositories/ProductRepository.ts';
import type { ProductionRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
import type { VideoRepository } from '../../../domain/video/repositories/VideoRepository.ts';
import { YouTubeDataClient } from '../../../infrastructure/youtube/api/YouTubeDataClient.ts';

/**
 * Prépare les fiches du site aylabs.fr d'une vidéo publiée : titre, accroche et durée lus
 * sur YouTube, date et heure de Paris, produits rattachés et leurs liens d'achat. Rien
 * n'est écrit — l'écran ouvre l'Aylabs Content Studio avec ces valeurs, qui termine le
 * travail et commite.
 */
export class ProposeAylabsCards {
  private readonly productions: ProductionRepository;
  private readonly videos: VideoRepository;
  private readonly products: ProductRepository;
  private readonly youtubeApiKey: string | null;

  constructor(
    productions: ProductionRepository,
    videos: VideoRepository,
    products: ProductRepository,
    youtubeApiKey: string | null,
  ) {
    this.productions = productions;
    this.videos = videos;
    this.products = products;
    this.youtubeApiKey = youtubeApiKey;
  }

  async execute(productionId: string): Promise<AylabsCardsProposal> {
    const production = this.productions.findViewById(productionId);
    if (!production) throw notFound('Vidéo');
    const code = production.videoExternalId;
    if (!code || !production.videoId) {
      throw badRequest('Rattache d’abord la sortie YouTube de cette vidéo.');
    }

    const snippet = await this.readSnippet(code);
    const published = parisDateTime(this.videos.findById(production.videoId)?.publishedAt ?? '');
    const pubDate = published.date || production.videoDate || production.plannedDate || '';
    const title =
      snippet?.title || production.videoTitle || production.publishTitle || production.title;

    const linked = this.products
      .findAll()
      .filter(
        (product) =>
          (product.productionId === production.id || product.videoId === production.videoId) &&
          product.status !== 'cancelled' &&
          product.status !== 'returned',
      );

    const productCards: ProductCard[] = linked.map((product) => ({
      sourceId: product.id,
      title: product.name,
      description: '',
      category: 'Domotique',
      price: product.valueCents > 0 ? product.valueCents / 100 : null,
      videoCode: code,
      pubDate,
      buyLinks: product.url ? [product.url] : [],
    }));

    // Un lien d'achat par produit en tête du texte sous la vidéo, comme les fiches existantes.
    const links = linked
      .filter((product) => product.url)
      .map((product) => `🛒 ${product.name} : ${product.url}`);

    return {
      video: {
        title,
        description: summarizeDescription(snippet?.description || production.publishDescription),
        pubDate,
        pubTime: published.time,
        code,
        duration: formatIsoDuration(snippet?.duration),
        tags: [],
        body: links.join('\n'),
      },
      products: productCards,
    };
  }

  /** Titre, description et durée. Un échec ne bloque pas : l'éditeur laisse les champs à saisir. */
  private async readSnippet(code: string) {
    if (!this.youtubeApiKey) return null;
    try {
      return await new YouTubeDataClient(this.youtubeApiKey).fetchVideoSnippet(code);
    } catch (error) {
      console.warn(`Fiche YouTube illisible (${code}) :`, (error as Error).message);
      return null;
    }
  }
}
