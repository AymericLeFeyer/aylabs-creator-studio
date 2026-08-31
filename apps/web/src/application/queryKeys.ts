import type { AnalyticsParams } from '../infrastructure/analytics/api/analyticsApi.ts';
import type { CategoryListParams } from '../infrastructure/category/api/categoryApi.ts';

/**
 * Clés de cache centralisées : toute mutation invalide par préfixe, ce qui évite
 * d'oublier une vue lors d'un ajout de revenu ou d'une collecte.
 */
export const queryKeys = {
  channels: (includeArchived: boolean) => ['channels', includeArchived] as const,
  categories: (params: CategoryListParams) => ['categories', params] as const,
  revenues: (params: unknown) => ['revenues', params] as const,
  expenses: (params: unknown) => ['expenses', params] as const,
  videos: (params: unknown) => ['videos', params] as const,
  analytics: (params: AnalyticsParams) => ['analytics', params] as const,
};

/** Racines à invalider après une écriture qui change les chiffres agrégés. */
export const MONEY_ROOTS = ['analytics', 'revenues', 'expenses'] as const;
