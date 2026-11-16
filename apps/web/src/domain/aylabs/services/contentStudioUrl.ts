import type { ProductCard, VideoCard } from '../entities/AylabsCard.ts';

/** L'Aylabs Content Studio, où les fiches du site se terminent et se commitent. */
export const AYLABS_CONTENT_STUDIO_URL = 'https://aylabs-content.aycorp.dev';

type Params = [string, string | number | null | undefined][];

/**
 * Le contrat est celui de `shared/prefill.ts` du Content Studio (dépôt aylabs) : les noms
 * sont ceux des champs de ses brouillons, les listes se répètent. À garder aligné.
 */
const build = (kind: 'video' | 'produit', params: Params, lists: Params): string => {
  const search = new URLSearchParams({ creer: kind });
  for (const [key, value] of [...params, ...lists]) {
    if (value !== null && value !== undefined && String(value).trim() !== '') {
      search.append(key, String(value));
    }
  }
  return `${AYLABS_CONTENT_STUDIO_URL}/?${search.toString()}`;
};

export const videoCardUrl = (card: VideoCard): string =>
  build(
    'video',
    [
      ['title', card.title],
      ['description', card.description],
      ['pubDate', card.pubDate],
      ['pubTime', card.pubTime],
      ['code', card.code],
      ['duration', card.duration],
      ['body', card.body],
    ],
    card.tags.map((tag): [string, string] => ['tag', tag]),
  );

export const productCardUrl = (card: ProductCard): string =>
  build(
    'produit',
    [
      ['title', card.title],
      ['description', card.description],
      ['category', card.category],
      ['price', card.price],
      ['videoCode', card.videoCode],
      ['pubDate', card.pubDate],
    ],
    card.buyLinks.map((link): [string, string] => ['buyLink', link]),
  );
