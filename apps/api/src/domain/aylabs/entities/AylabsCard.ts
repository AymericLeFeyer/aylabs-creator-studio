/**
 * Les fiches du site aylabs.fr : un fichier Markdown par vidéo et par produit, dans le
 * dépôt du site (`src/content/videos`, `src/content/products`). Le studio ne les lit pas,
 * il en **propose** et les commite — le contrat de forme est celui de l'Aylabs Content
 * Studio, dont le parseur du site n'accepte qu'un sous-ensemble de YAML.
 */
export interface VideoCard {
  slug: string;
  title: string;
  description: string;
  /** AAAA-MM-JJ, heure de Paris. */
  pubDate: string;
  /** HH:MM, vide = la fiche sort à minuit. */
  pubTime: string;
  code: string;
  /** `10:18` ou `1:02:05`. */
  duration: string;
  tags: string[];
  body: string;
}

export interface ProductCard {
  /** Le produit du studio dont la fiche est tirée, pour que l'écran le retrouve. */
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
  /** `false` tant que le jeton GitHub n'est pas renseigné : l'écran dit quoi faire. */
  configured: boolean;
  repo: string;
  video: VideoCard;
  products: ProductCard[];
  /** Slugs déjà pris dans le dépôt, pour prévenir avant d'écraser quoi que ce soit. */
  takenSlugs: { videos: string[]; products: string[] };
}

export interface AylabsCardsResult {
  commitUrl: string;
  files: string[];
}
