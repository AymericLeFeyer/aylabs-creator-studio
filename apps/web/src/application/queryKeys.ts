import type { AnalyticsParams } from '../infrastructure/analytics/api/analyticsApi.ts';
import type { CategoryListParams } from '../infrastructure/category/api/categoryApi.ts';
import type { BrandStatsParams } from '../infrastructure/brand/api/brandApi.ts';

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

  brands: (includeArchived: boolean) => ['brands', includeArchived] as const,
  brandStats: (params: BrandStatsParams) => ['brandStats', params] as const,
  productions: (params: unknown) => ['productions', params] as const,
  production: (id: string) => ['productions', 'detail', id] as const,
  productionOverview: () => ['productionOverview'] as const,
  productionSteps: (includeArchived: boolean) => ['productionSteps', includeArchived] as const,
  productionSlots: (params: unknown) => ['productionSlots', params] as const,
  products: (params: unknown) => ['products', params] as const,
  sponsorships: (params: unknown) => ['sponsorships', params] as const,
  ideas: () => ['ideas'] as const,

  legalOverview: () => ['legalOverview'] as const,
  legalObligations: (includeArchived: boolean) => ['legalObligations', includeArchived] as const,
};

/** Racines à invalider après une écriture qui change les chiffres agrégés. */
export const MONEY_ROOTS = ['analytics', 'revenues', 'expenses'] as const;

/**
 * Racines du module de production. Toute écriture les invalide toutes : les cartes de
 * la file d'attente portent les compteurs de produits et de sponsos, l'aperçu porte les
 * alertes, et un seul changement de statut peut faire bouger les trois.
 */
export const PRODUCTION_ROOTS = [
  'productions',
  'productionOverview',
  'productionSlots',
  'products',
  'sponsorships',
] as const;

/**
 * Écrire un produit ou une sponso crée, met à jour ou supprime un revenu : les vues
 * d'argent doivent repartir en même temps que celles de production.
 */
export const PARTNER_ROOTS = [...PRODUCTION_ROOTS, ...MONEY_ROOTS, 'brandStats'] as const;

/**
 * Racines du suivi administratif. Le référentiel part avec l'aperçu : changer un jour
 * limite déplace l'échéance sur tous les mois déjà affichés, et cocher une case retire
 * une alerte du dashboard.
 */
export const LEGAL_ROOTS = ['legalOverview', 'legalObligations'] as const;
