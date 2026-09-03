import type { Granularity, IsoDate } from '../../../shared/dates.ts';
import type { Cents } from '../../../shared/money.ts';

export interface AnalyticsQuery {
  from: IsoDate;
  to: IsoDate;
  granularity: Granularity;
  /** Vide = toutes les chaînes actives (vue cumulée). */
  channelIds: string[];
  /** Inclut les revenus/dépenses non rattachés à une chaîne. Défaut : true. */
  includeUnassigned: boolean;
}

/**
 * Un point de la série. Les composantes de revenu sont exposées BRUTES
 * (cash / en nature / dépenses) : c'est le consommateur qui compose CA et bénéfice
 * selon les cases cochées, pour qu'il n'existe qu'une seule règle de calcul.
 */
export interface TimeSeriesPoint {
  date: IsoDate;

  // --- Audience (flux : sommables) ---
  views: number;
  watchHours: number;
  subscribersGained: number;
  subscribersLost: number;
  subscribersNet: number;
  likes: number;
  comments: number;
  shares: number;

  // --- Audience (cumulé : dernière valeur connue du bucket, jamais sommée dans le temps) ---
  subscribersTotal: number | null;
  viewsTotal: number | null;

  // --- Argent (en centimes) ---
  /** AdSense estimé, remonté par YouTube Analytics. */
  adsenseCents: Cents;
  /** Revenus manuels de nature `cash` (affiliation, sponsos...), AdSense exclu. */
  manualCashCents: Cents;
  /** Revenus manuels de nature `in_kind` (produits offerts valorisés). */
  inKindCents: Cents;
  /** Dépenses saisies manuellement sur le bucket (impôts, matériel, abonnements...). */
  expenseCents: Cents;

  /**
   * Détail du bucket par catégorie (clé = identifiant de catégorie), AdSense compris.
   * Permet d'empiler le graphique avec les couleurs des catégories plutôt que d'agréger
   * tous les revenus manuels sous une seule barre. Une catégorie sans montant sur le
   * bucket est absente de l'objet. Les deux dictionnaires sont séparés : une catégorie
   * de portée `both` peut apparaître des deux côtés le même jour.
   */
  revenueByCategory: Record<string, Cents>;
  expenseByCategory: Record<string, Cents>;
}

/** Cumuls sur toute la période demandée. */
export interface AnalyticsTotals {
  views: number;
  watchHours: number;
  subscribersGained: number;
  subscribersLost: number;
  subscribersNet: number;
  likes: number;
  comments: number;
  shares: number;
  /** Abonnés cumulés à la fin de la période (somme des chaînes sélectionnées). */
  subscribersTotal: number | null;
  /** Nombre de vidéos publiées pendant la période. */
  videosPublished: number;
  /** Nombre de revenus en nature saisis (produits reçus), pas leur montant. */
  inKindEntries: number;
  adsenseCents: Cents;
  manualCashCents: Cents;
  inKindCents: Cents;
  expenseCents: Cents;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  categoryName: string;
  color: string;
  nature: 'cash' | 'in_kind';
  totalCents: Cents;
}

export interface ChannelBreakdownItem {
  channelId: string;
  channelName: string;
  color: string;
  views: number;
  subscribersNet: number;
  subscribersTotal: number | null;
  revenueCashCents: Cents;
  inKindCents: Cents;
}

/**
 * Repère de sortie de vidéo, à poser en trait vertical sur les graphiques.
 * `bucket` est déjà aligné sur `series[].date` : le front n'a rien à recalculer.
 */
export interface VideoMarker {
  id: string;
  channelId: string;
  channelName: string;
  channelColor: string;
  title: string;
  /** Miniature YouTube (format `medium`, 320×180), `null` si la vidéo n'en a pas. */
  thumbnailUrl: string | null;
  date: IsoDate;
  bucket: IsoDate;
}

/**
 * Une ligne du tableau de performance par vidéo.
 *
 * Les compteurs (`views`, `subscribersGained`…) sont des CUMULS depuis la sortie,
 * relevés par la collecte : ils ne se comparent pas aux totaux de la période et ne
 * s'additionnent pas avec eux. Les montants réutilisent les noms de `MoneyParts`
 * pour que le front applique la même règle CA / bénéfice qu'ailleurs.
 */
export interface VideoPerformanceRow {
  videoId: string;
  externalId: string;
  channelId: string;
  channelName: string;
  channelColor: string;
  title: string;
  thumbnailUrl: string | null;
  date: IsoDate;

  views: number;
  watchHours: number;
  subscribersGained: number;
  likes: number;
  comments: number;
  /** `false` tant qu'aucune collecte n'a mesuré cette vidéo : « — » plutôt que « 0 ». */
  hasStats: boolean;

  /** AdSense attribué à la vidéo par YouTube Analytics. */
  adsenseCents: Cents;
  /** Revenus manuels `cash` rattachés à la vidéo, quelle que soit leur date. */
  manualCashCents: Cents;
  inKindCents: Cents;
  expenseCents: Cents;
}

export interface AnalyticsResult {
  query: AnalyticsQuery;
  series: TimeSeriesPoint[];
  totals: AnalyticsTotals;
  /** Répartition des REVENUS par catégorie, AdSense inclus. */
  byCategory: CategoryBreakdownItem[];
  /** Répartition des DÉPENSES par catégorie. */
  byExpenseCategory: CategoryBreakdownItem[];
  byChannel: ChannelBreakdownItem[];
  /** Sorties de vidéo de la période, pour les repères du graphique. */
  videos: VideoMarker[];
  /** Performance de chaque vidéo sortie dans la période, argent rattaché compris. */
  videoPerformance: VideoPerformanceRow[];
  /**
   * Les vidéos publiées **avant** la période, avec leurs compteurs cumulés.
   *
   * Elles continuent de faire des vues : sur un mois donné, une bonne part de l'audience
   * vient du catalogue, et un tableau qui ne montre que les sorties de la période laisse
   * croire le contraire. Les compteurs sont des cumuls **depuis la sortie** — comme ceux
   * de `videoPerformance` — et ne se découpent donc pas par période : YouTube Analytics
   * n'est collecté par vidéo qu'en cumul, jamais jour par jour.
   *
   * Limité aux 100 plus vues : au-delà, c'est un export, pas un tableau qu'on lit.
   */
  catalogPerformance: VideoPerformanceRow[];
  /** Cumuls sur la période immédiatement précédente, de même longueur, pour les variations. */
  previousTotals: AnalyticsTotals | null;
}
