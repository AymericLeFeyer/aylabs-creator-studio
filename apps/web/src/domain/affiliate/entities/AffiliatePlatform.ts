/** Contrat de `/api/affiliate-platforms`. */

export interface PlatformBrandRef {
  id: string;
  name: string;
  color: string;
}

/**
 * Une plateforme d'affiliation : Amazon Partenaires, Awin, Effiliation…
 *
 * Elle répond à deux questions posées à des moments différents : **où** est gérée
 * l'affiliation d'une marque (le lien, les marques couvertes), et **laquelle rapporte le
 * plus** (l'argent). La seconde suppose de rattacher les revenus à une plateforme, ce que
 * fait le champ « Plateforme » du formulaire de revenu.
 */
export interface AffiliatePlatform {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  imageUrl: string | null;
  color: string;
  notes: string | null;
  sortOrder: number;
  isArchived: boolean;
  /** Marques couvertes. Lien N:N, facultatif des deux côtés. */
  brands: PlatformBrandRef[];
  /** Ce qu'elle a rapporté **sur la période affichée**. */
  earnedCents: number;
  /** Ce qu'elle a rapporté **depuis toujours** : sert à décider si on la garde. */
  totalEarnedCents: number;
  entriesCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AffiliatePlatformInput {
  name: string;
  description?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  color?: string;
  notes?: string | null;
  sortOrder?: number;
  /** Remplace **entièrement** la liste des marques quand il est fourni. */
  brandIds?: string[];
  isArchived?: boolean;
}
