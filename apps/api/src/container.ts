import type { DatabaseSync } from 'node:sqlite';
import type { Config } from './config.ts';
import { getDatabase } from './infrastructure/db/database.ts';
import { SqliteChannelRepository } from './infrastructure/channel/repositories/SqliteChannelRepository.ts';
import { SqliteMetricsRepository } from './infrastructure/metrics/repositories/SqliteMetricsRepository.ts';
import { SqliteCategoryRepository } from './infrastructure/category/repositories/SqliteCategoryRepository.ts';
import { SqliteRevenueEntryRepository } from './infrastructure/revenue/repositories/SqliteRevenueEntryRepository.ts';
import { SqliteExpenseRepository } from './infrastructure/expense/repositories/SqliteExpenseRepository.ts';
import { SqliteVideoRepository } from './infrastructure/video/repositories/SqliteVideoRepository.ts';
import { SqliteBrandRepository } from './infrastructure/brand/repositories/SqliteBrandRepository.ts';
import { SqliteProductionRepository } from './infrastructure/production/repositories/SqliteProductionRepository.ts';
import { SqliteProductionStepRepository } from './infrastructure/production/repositories/SqliteProductionStepRepository.ts';
import { SqliteProductionSlotRepository } from './infrastructure/production/repositories/SqliteProductionSlotRepository.ts';
import { SqliteProductRepository } from './infrastructure/product/repositories/SqliteProductRepository.ts';
import { SqliteSponsorshipRepository } from './infrastructure/sponsorship/repositories/SqliteSponsorshipRepository.ts';
import { SqliteIdeaRepository } from './infrastructure/idea/repositories/SqliteIdeaRepository.ts';
import { seedDefaultCategories } from './application/category/usecases/SeedDefaultCategories.ts';
import { seedDefaultSteps } from './application/production/usecases/SeedDefaultSteps.ts';
import { ManageProducts } from './application/product/usecases/ManageProducts.ts';
import { ManageSponsorships } from './application/sponsorship/usecases/ManageSponsorships.ts';
import { ManageProductions } from './application/production/usecases/ManageProductions.ts';
import { GetProductionOverview } from './application/production/usecases/GetProductionOverview.ts';
import { CollectMetrics } from './application/metrics/usecases/CollectMetrics.ts';
import { GetAnalytics } from './application/analytics/usecases/GetAnalytics.ts';
import { YouTubeDataClient } from './infrastructure/youtube/api/YouTubeDataClient.ts';

export interface Container {
  db: DatabaseSync;
  config: Config;
  channels: SqliteChannelRepository;
  metrics: SqliteMetricsRepository;
  categories: SqliteCategoryRepository;
  revenues: SqliteRevenueEntryRepository;
  expenses: SqliteExpenseRepository;
  videos: SqliteVideoRepository;
  brands: SqliteBrandRepository;
  productions: SqliteProductionRepository;
  productionSteps: SqliteProductionStepRepository;
  productionSlots: SqliteProductionSlotRepository;
  products: SqliteProductRepository;
  sponsorships: SqliteSponsorshipRepository;
  ideas: SqliteIdeaRepository;
  collectMetrics: CollectMetrics;
  getAnalytics: GetAnalytics;
  /**
   * Écritures du module de production. Les routes passent par elles et jamais par les
   * dépôts : c'est ici que le revenu généré par un produit ou une sponso est tenu à jour.
   */
  manageProducts: ManageProducts;
  manageSponsorships: ManageSponsorships;
  manageProductions: ManageProductions;
  getProductionOverview: GetProductionOverview;
  /** `null` tant qu'aucune clé API YouTube n'est configurée. */
  youtubeData: YouTubeDataClient | null;
}

/** Assemble les implémentations concrètes derrière les interfaces du domaine. */
export const buildContainer = (config: Config): Container => {
  const db = getDatabase(config.databasePath);
  seedDefaultCategories(db);
  seedDefaultSteps(db);

  const channels = new SqliteChannelRepository(db);
  const metrics = new SqliteMetricsRepository(db);
  const categories = new SqliteCategoryRepository(db);
  const revenues = new SqliteRevenueEntryRepository(db);
  const expenses = new SqliteExpenseRepository(db);
  const videos = new SqliteVideoRepository(db);
  const brands = new SqliteBrandRepository(db);
  const productions = new SqliteProductionRepository(db);
  const productionSteps = new SqliteProductionStepRepository(db);
  const productionSlots = new SqliteProductionSlotRepository(db);
  const products = new SqliteProductRepository(db);
  const sponsorships = new SqliteSponsorshipRepository(db);
  const ideas = new SqliteIdeaRepository(db);

  const manageProducts = new ManageProducts(products, productions, brands, revenues);
  const manageSponsorships = new ManageSponsorships(sponsorships, productions, brands, revenues);

  return {
    db,
    config,
    channels,
    metrics,
    categories,
    revenues,
    expenses,
    videos,
    brands,
    productions,
    productionSteps,
    productionSlots,
    products,
    sponsorships,
    ideas,
    manageProducts,
    manageSponsorships,
    manageProductions: new ManageProductions(
      productions,
      productionSteps,
      products,
      sponsorships,
      manageProducts,
      manageSponsorships,
    ),
    getProductionOverview: new GetProductionOverview(
      productions,
      productionSlots,
      products,
      sponsorships,
    ),
    collectMetrics: new CollectMetrics(channels, metrics, videos, {
      youtubeApiKey: config.youtubeApiKey,
      gcpClientId: config.gcpClientId,
      gcpClientSecret: config.gcpClientSecret,
      backfillDays: config.backfillDays,
    }),
    getAnalytics: new GetAnalytics(channels, metrics, revenues, categories, expenses, videos),
    youtubeData: config.youtubeApiKey ? new YouTubeDataClient(config.youtubeApiKey) : null,
  };
};
