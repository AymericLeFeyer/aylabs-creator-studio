import type { Cents } from '../../../shared/money.ts';

/**
 * Une plateforme d'affiliation : Amazon Partenaires, Awin, Effiliation…
 *
 * Elle répond à deux questions qu'on se pose à des moments différents : **où** est gérée
 * l'affiliation d'une marque donnée (le lien, les marques couvertes), et **laquelle
 * rapporte le plus** (l'argent). La première se lit sur la fiche ; la seconde suppose de
 * rattacher les revenus à une plateforme — d'où `revenue_entries.platform_id`, posé
 * exactement comme `video_id`.
 *
 * Le lien avec les marques est **N:N et facultatif des deux côtés** : une plateforme
 * couvre plusieurs marques, une marque peut être disponible sur plusieurs plateformes, et
 * beaucoup de plateformes n'ont aucune marque renseignée au départ.
 */
export interface AffiliatePlatform {
  id: string;
  name: string;
  description: string | null;
  /** Adresse du tableau de bord de la plateforme. `null` quand on ne l'a pas notée. */
  url: string | null;
  /** Logo. `null` = repli sur le favicon du site, puis l'initiale sur `color`. */
  imageUrl: string | null;
  color: string;
  notes: string | null;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Marque couverte par une plateforme, en version courte pour l'affichage. */
export interface PlatformBrandRef {
  id: string;
  name: string;
  color: string;
}

/**
 * Vue d'une plateforme telle que l'écran l'affiche : ses marques, et ce qu'elle a
 * rapporté.
 *
 * `earnedCents` est borné par la période demandée ; `totalEarnedCents` ne l'est pas.
 * Les deux sont utiles et ne disent pas la même chose — « ce trimestre » sert à
 * comparer, « depuis toujours » à décider si une plateforme mérite encore d'être suivie.
 */
export interface AffiliatePlatformView extends AffiliatePlatform {
  brands: PlatformBrandRef[];
  earnedCents: Cents;
  totalEarnedCents: Cents;
  /** Nombre de revenus rattachés sur la période : un montant sans compte se lit mal. */
  entriesCount: number;
}

export interface CreateAffiliatePlatformInput {
  name: string;
  description?: string | null;
  url?: string | null;
  imageUrl?: string | null;
  color?: string;
  notes?: string | null;
  sortOrder?: number;
  /** Remplace **entièrement** la liste des marques quand elle est fournie. */
  brandIds?: string[];
}

export interface UpdateAffiliatePlatformInput extends Partial<CreateAffiliatePlatformInput> {
  isArchived?: boolean;
}
