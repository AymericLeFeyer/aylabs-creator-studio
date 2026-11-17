/** Contrat de l'API : ce que le studio sait des fiches du site aylabs.fr. */
export interface VideoCard {
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
  title: string;
  description: string;
  category: string;
  price: number | null;
  videoCode: string;
  pubDate: string;
  buyLinks: string[];
}

export interface AylabsCardsProposal {
  video: VideoCard;
  products: ProductCard[];
}
