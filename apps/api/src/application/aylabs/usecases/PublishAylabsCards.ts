import { badRequest, conflict, notFound } from '../../../shared/errors.ts';
import type {
  AylabsCardsProposal,
  AylabsCardsResult,
  ProductCard,
  VideoCard,
} from '../../../domain/aylabs/entities/AylabsCard.ts';
import type { AylabsRepository } from '../../../domain/aylabs/repositories/AylabsRepository.ts';
import {
  formatIsoDuration,
  parisDateTime,
  productMarkdown,
  slugify,
  summarizeDescription,
  uniqueSlug,
  videoMarkdown,
} from '../../../domain/aylabs/services/cards.ts';
import type { ProductRepository } from '../../../domain/product/repositories/ProductRepository.ts';
import type { ProductionRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
import type { VideoRepository } from '../../../domain/video/repositories/VideoRepository.ts';
import { YouTubeDataClient } from '../../../infrastructure/youtube/api/YouTubeDataClient.ts';

export interface PublishAylabsCardsInput {
  video: VideoCard | null;
  products: ProductCard[];
}

/**
 * Les fiches vidéo et produit du site aylabs.fr, d'après une vidéo publiée.
 *
 * `propose` prépare tout ce que le studio sait (titre, description et durée lus sur
 * YouTube, date et heure de Paris, produits rattachés et leurs liens d'achat) ; l'écran
 * le fait relire et compléter (image, avantages, verdict…) ; `publish` commite le tout
 * d'un coup. Rien ne part sans ce second geste.
 */
export class PublishAylabsCards {
  private readonly productions: ProductionRepository;
  private readonly videos: VideoRepository;
  private readonly products: ProductRepository;
  private readonly site: AylabsRepository;
  private readonly youtubeApiKey: string | null;

  constructor(
    productions: ProductionRepository,
    videos: VideoRepository,
    products: ProductRepository,
    site: AylabsRepository,
    youtubeApiKey: string | null,
  ) {
    this.productions = productions;
    this.videos = videos;
    this.products = products;
    this.site = site;
    this.youtubeApiKey = youtubeApiKey;
  }

  async propose(productionId: string): Promise<AylabsCardsProposal> {
    const production = this.productions.findViewById(productionId);
    if (!production) throw notFound('Vidéo');
    const code = production.videoExternalId;
    if (!code || !production.videoId) {
      throw badRequest('Rattache d’abord la sortie YouTube de cette vidéo.');
    }
    const video = this.videos.findById(production.videoId);

    const snippet = await this.readSnippet(code);
    const published = parisDateTime(video?.publishedAt ?? '');
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

    const [takenVideos, takenProducts] = this.site.configured()
      ? await Promise.all([this.site.listSlugs('videos'), this.site.listSlugs('products')])
      : [[], []];
    const videoSlugs = new Set(takenVideos);
    const productSlugs = new Set(takenProducts);

    const productCards: ProductCard[] = linked.map((product) => {
      const slug = uniqueSlug(slugify(product.name), productSlugs);
      productSlugs.add(slug);
      return {
        sourceId: product.id,
        slug,
        title: product.name,
        image: '',
        description: '',
        tags: [],
        protocols: [],
        compatible: [],
        videoCode: code,
        buyLinks: product.url ? [product.url] : [],
        pubDate,
        category: 'Domotique',
        price: product.valueCents > 0 ? product.valueCents / 100 : null,
        rating: null,
        pros: [],
        cons: [],
        verdict: '',
        body: '',
      };
    });

    const links = linked
      .filter((product) => product.url)
      .map((product) => `🛒 ${product.name} : ${product.url}`);

    return {
      configured: this.site.configured(),
      repo: this.site.repo(),
      video: {
        slug: uniqueSlug(slugify(title), videoSlugs),
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
      takenSlugs: { videos: takenVideos, products: takenProducts },
    };
  }

  async publish(productionId: string, input: PublishAylabsCardsInput): Promise<AylabsCardsResult> {
    if (!this.productions.findById(productionId)) throw notFound('Vidéo');
    if (!input.video && input.products.length === 0) {
      throw badRequest('Rien à créer : coche au moins une fiche.');
    }

    const [takenVideos, takenProducts] = await Promise.all([
      this.site.listSlugs('videos'),
      this.site.listSlugs('products'),
    ]);
    const files: { path: string; content: string }[] = [];
    const seen = new Set<string>();
    const add = (path: string, content: string) => {
      if (seen.has(path)) throw conflict(`Deux fiches visent le même fichier : ${path}`);
      seen.add(path);
      files.push({ path, content });
    };

    if (input.video) {
      if (takenVideos.includes(input.video.slug)) {
        throw conflict(`Une fiche vidéo « ${input.video.slug} » existe déjà sur le site.`);
      }
      add(`src/content/videos/${input.video.slug}.md`, videoMarkdown(input.video));
    }
    for (const product of input.products) {
      if (takenProducts.includes(product.slug)) {
        throw conflict(`Une fiche produit « ${product.slug} » existe déjà sur le site.`);
      }
      add(`src/content/products/${product.slug}.md`, productMarkdown(product));
    }

    const message =
      files.length === 1
        ? `content(${input.video ? 'video' : 'product'}): add ${(input.video ?? input.products[0]!).slug}`
        : `content: ${files.length} changes\n\n${files.map((file) => `- add ${file.path}`).join('\n')}`;
    const commitUrl = await this.site.commit(files, message);
    return { commitUrl, files: files.map((file) => file.path) };
  }

  /** Titre, description et durée. Un échec ne bloque pas : l'écran laisse les champs à saisir. */
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
