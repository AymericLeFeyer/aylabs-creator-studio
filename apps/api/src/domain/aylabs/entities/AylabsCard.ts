/**
 * Ce que le studio sait des fiches du site aylabs.fr (une par vidéo, une par produit). Il
 * ne les écrit pas : l'écran les passe par l'URL à l'Aylabs Content Studio, où on les
 * termine. Les noms des champs sont ceux des brouillons de cet outil.
 */
export interface VideoCard {
  title: string;
  description: string;
  /** AAAA-MM-JJ, heure de Paris. */
  pubDate: string;
  /** HH:MM, vide = la fiche sort à minuit. */
  pubTime: string;
  code: string;
  /** `10:18` ou `1:02:05`, vide si YouTube ne l'a pas donnée. */
  duration: string;
  tags: string[];
  body: string;
}

export interface ProductCard {
  /** Le produit du studio dont la fiche est tirée. */
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
