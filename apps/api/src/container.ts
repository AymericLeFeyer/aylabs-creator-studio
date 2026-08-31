import type { DatabaseSync } from 'node:sqlite';
import type { Config } from './config.ts';
import { getDatabase } from './infrastructure/db/database.ts';
import { SqliteChannelRepository } from './infrastructure/channel/repositories/SqliteChannelRepository.ts';
import { SqliteMetricsRepository } from './infrastructure/metrics/repositories/SqliteMetricsRepository.ts';
import { SqliteCategoryRepository } from './infrastructure/category/repositories/SqliteCategoryRepository.ts';
import { SqliteRevenueEntryRepository } from './infrastructure/revenue/repositories/SqliteRevenueEntryRepository.ts';
import { SqliteExpenseRepository } from './infrastructure/expense/repositories/SqliteExpenseRepository.ts';
import { SqliteVideoRepository } from './infrastructure/video/repositories/SqliteVideoRepository.ts';
import { seedDefaultCategories } from './application/category/usecases/SeedDefaultCategories.ts';
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
  collectMetrics: CollectMetrics;
  getAnalytics: GetAnalytics;
  /** `null` tant qu'aucune clé API YouTube n'est configurée. */
  youtubeData: YouTubeDataClient | null;
}

/** Assemble les implémentations concrètes derrière les interfaces du domaine. */
export const buildContainer = (config: Config): Container => {
  const db = getDatabase(config.databasePath);
  seedDefaultCategories(db);

  const channels = new SqliteChannelRepository(db);
  const metrics = new SqliteMetricsRepository(db);
  const categories = new SqliteCategoryRepository(db);
  const revenues = new SqliteRevenueEntryRepository(db);
  const expenses = new SqliteExpenseRepository(db);
  const videos = new SqliteVideoRepository(db);

  return {
    db,
    config,
    channels,
    metrics,
    categories,
    revenues,
    expenses,
    videos,
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
