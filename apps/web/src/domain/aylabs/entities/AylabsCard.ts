/** Contrat de l'API : les fiches du site aylabs.fr (un Markdown par vidéo et par produit). */
export interface VideoCard {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  pubTime: string;
  code: string;
  duration: string;
  tags: string[];
  body: string;
}

export interface ProductCard {
  sourceId: string;
  slug: string;
  title: string;
  image: string;
  description: string;
  tags: string[];
  protocols: string[];
  compatible: string[];
  videoCode: string;
  buyLinks: string[];
  pubDate: string;
  category: string;
  price: number | null;
  rating: number | null;
  pros: string[];
  cons: string[];
  verdict: string;
  body: string;
}

export interface AylabsCardsProposal {
  configured: boolean;
  repo: string;
  video: VideoCard;
  products: ProductCard[];
  takenSlugs: { videos: string[]; products: string[] };
}

export interface AylabsCardsInput {
  video: VideoCard | null;
  products: ProductCard[];
}

export interface AylabsCardsResult {
  commitUrl: string;
  files: string[];
}
