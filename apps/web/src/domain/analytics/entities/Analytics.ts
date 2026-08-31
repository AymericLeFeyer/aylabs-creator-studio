/**
 * Contrat de l'endpoint `GET /api/analytics`.
 *
 * Ces types reflètent `apps/api/src/domain/analytics/entities/TimeSeries.ts`. Ils sont
 * redéclarés côté front plutôt que partagés dans un package : le front n'a besoin que
 * de la forme des réponses, et un package commun imposerait une étape de build
 * supplémentaire aux deux applications comme à l'image Docker.
 * Toute évolution du contrat doit être répercutée des deux côtés.
 */

export type Granularity = 'day' | 'week' | 'month';

export interface TimeSeriesPoint {
  date: string;

  views: number;
  watchHours: number;
  subscribersGained: number;
  subscribersLost: number;
  subscribersNet: number;
  likes: number;
  comments: number;
  shares: number;

  subscribersTotal: number | null;
  viewsTotal: number | null;

  /** Montants en centimes. */
  adsenseCents: number;
  manualCashCents: number;
  inKindCents: number;
  expenseCents: number;
  /**
   * Détail du bucket par catégorie (clé = identifiant de catégorie), AdSense compris.
   * Deux dictionnaires séparés : une catégorie de portée `both` peut apparaître des
   * deux côtés le même jour.
   */
  revenueByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
}

export interface AnalyticsTotals {
  views: number;
  watchHours: number;
  subscribersGained: number;
  subscribersLost: number;
  subscribersNet: number;
  likes: number;
  comments: number;
  shares: number;
  subscribersTotal: number | null;
  adsenseCents: number;
  manualCashCents: number;
  inKindCents: number;
  expenseCents: number;
}

export interface CategoryBreakdownItem {
  categoryId: string;
  categoryName: string;
  color: string;
  nature: 'cash' | 'in_kind';
  totalCents: number;
}

export interface ChannelBreakdownItem {
  channelId: string;
  channelName: string;
  color: string;
  views: number;
  subscribersNet: number;
  subscribersTotal: number | null;
  revenueCashCents: number;
  inKindCents: number;
}

/**
 * Repère de sortie de vidéo. `bucket` est déjà aligné sur `series[].date` :
 * l'API applique la règle de découpage, le front n'a qu'à comparer.
 */
export interface VideoMarker {
  id: string;
  channelId: string;
  channelName: string;
  channelColor: string;
  title: string;
  /** Miniature YouTube (format `medium`, 320×180), `null` si la vidéo n'en a pas. */
  thumbnailUrl: string | null;
  date: string;
  bucket: string;
}

export interface AnalyticsQuery {
  from: string;
  to: string;
  granularity: Granularity;
  channelIds: string[];
  includeUnassigned: boolean;
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
  previousTotals: AnalyticsTotals | null;
}
