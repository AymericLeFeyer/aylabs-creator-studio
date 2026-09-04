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
import { SqliteTimeEntryRepository } from './infrastructure/production/repositories/SqliteTimeEntryRepository.ts';
import { SqliteTodoRepository } from './infrastructure/production/repositories/SqliteTodoRepository.ts';
import { SqliteRecurringExpenseRepository } from './infrastructure/expense/repositories/SqliteRecurringExpenseRepository.ts';
import { SqliteProductRepository } from './infrastructure/product/repositories/SqliteProductRepository.ts';
import { SqliteSponsorshipRepository } from './infrastructure/sponsorship/repositories/SqliteSponsorshipRepository.ts';
import { SqliteIdeaRepository } from './infrastructure/idea/repositories/SqliteIdeaRepository.ts';
import { SqliteCompanyRepository } from './infrastructure/legal/repositories/SqliteCompanyRepository.ts';
import { SqliteLegalObligationRepository } from './infrastructure/legal/repositories/SqliteLegalObligationRepository.ts';
import { SqliteLegalBookmarkRepository } from './infrastructure/legal/repositories/SqliteLegalBookmarkRepository.ts';
import { SqliteAffiliatePlatformRepository } from './infrastructure/affiliate/repositories/SqliteAffiliatePlatformRepository.ts';
import { SqliteInstagramAccountRepository } from './infrastructure/instagram/repositories/SqliteInstagramAccountRepository.ts';
import { SqliteInstagramDataRepository } from './infrastructure/instagram/repositories/SqliteInstagramDataRepository.ts';
import { CollectInstagram } from './application/instagram/usecases/CollectInstagram.ts';
import { GetInstagramOverview } from './application/instagram/usecases/GetInstagramOverview.ts';
import { SqliteWorkHoursRepository } from './infrastructure/planning/repositories/SqliteWorkHoursRepository.ts';
import { SqlitePlanningSettingsRepository } from './infrastructure/planning/repositories/SqlitePlanningSettingsRepository.ts';
import { SqlitePlanningItemRepository } from './infrastructure/planning/repositories/SqlitePlanningItemRepository.ts';
import { HomeAssistantClient } from './infrastructure/planning/api/HomeAssistantClient.ts';
import { ManagePlanning } from './application/planning/usecases/ManagePlanning.ts';
import { seedDefaultCategories } from './application/category/usecases/SeedDefaultCategories.ts';
import { seedDefaultSteps } from './application/production/usecases/SeedDefaultSteps.ts';
import { seedDefaultStepTodos } from './application/production/usecases/SeedDefaultStepTodos.ts';
import { seedLegalObligations } from './application/legal/usecases/SeedLegalObligations.ts';
import { ManageProducts } from './application/product/usecases/ManageProducts.ts';
import { ManageSponsorships } from './application/sponsorship/usecases/ManageSponsorships.ts';
import { ManageProductions } from './application/production/usecases/ManageProductions.ts';
import { GetProductionOverview } from './application/production/usecases/GetProductionOverview.ts';
import { ManageTodos } from './application/production/usecases/ManageTodos.ts';
import { TrackTime } from './application/production/usecases/TrackTime.ts';
import { SyncRecurringExpenses } from './application/expense/usecases/SyncRecurringExpenses.ts';
import { GetLegalOverview } from './application/legal/usecases/GetLegalOverview.ts';
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
  /** Sessions de travail chronométrées ou saisies à la main. */
  timeEntries: SqliteTimeEntryRepository;
  /** Référentiel des tâches d'étape, tâches ponctuelles et coches, dans un seul dépôt. */
  todos: SqliteTodoRepository;
  /** Règles de dépense récurrente. Les occurrences, elles, sont des `expenses`. */
  recurringExpenses: SqliteRecurringExpenseRepository;
  products: SqliteProductRepository;
  sponsorships: SqliteSponsorshipRepository;
  ideas: SqliteIdeaRepository;
  company: SqliteCompanyRepository;
  legalObligations: SqliteLegalObligationRepository;
  /** Liens utiles de l'écran Légal (Urssaf, impôts, banque…). */
  legalBookmarks: SqliteLegalBookmarkRepository;
  /** Plateformes d'affiliation, avec leurs marques et ce qu'elles rapportent. */
  affiliatePlatforms: SqliteAffiliatePlatformRepository;
  /** Comptes Instagram suivis. Le jeton ne sort jamais de ce dépôt. */
  instagramAccounts: SqliteInstagramAccountRepository;
  /** Stories, publications et relevés archivés d'Instagram. */
  instagramData: SqliteInstagramDataRepository;
  /** Plages travaillables de la semaine type. */
  workHours: SqliteWorkHoursRepository;
  /** Réglages du planning et connexion à l'agenda. Le jeton n'en sort jamais. */
  planningSettings: SqlitePlanningSettingsRepository;
  /** La pile de ce qui est en cours et attend des créneaux. */
  planningItems: SqlitePlanningItemRepository;
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
  /**
   * Cocher une tâche a un effet sur son étape : la règle vit dans ce use case, et les
   * routes ne touchent jamais les coches directement.
   */
  manageTodos: ManageTodos;
  /** Démarrage, arrêt et correction des sessions de travail. */
  trackTime: TrackTime;
  /** Projette les échéances des dépenses récurrentes. Idempotent. */
  syncRecurringExpenses: SyncRecurringExpenses;
  /** Tableau des obligations mensuelles + alertes reprises par le dashboard. */
  getLegalOverview: GetLegalOverview;
  /**
   * Le planning : placement des créneaux, approbation, publication dans l'agenda.
   * Seul point d'écriture du module — les routes ne touchent jamais la pile ni les
   * créneaux planifiés.
   */
  managePlanning: ManagePlanning;
  /**
   * La collecte Instagram. Les stories passent en premier : ce sont les seules données
   * qu'aucun rattrapage ne pourra jamais retrouver.
   */
  collectInstagram: CollectInstagram;
  getInstagramOverview: GetInstagramOverview;
  /** `null` tant qu'aucune clé API YouTube n'est configurée. */
  youtubeData: YouTubeDataClient | null;
}

/** Assemble les implémentations concrètes derrière les interfaces du domaine. */
export const buildContainer = (config: Config): Container => {
  const db = getDatabase(config.databasePath);
  seedDefaultCategories(db);
  seedDefaultSteps(db);
  seedDefaultStepTodos(db);
  seedLegalObligations(db);

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
  const timeEntries = new SqliteTimeEntryRepository(db);
  const todos = new SqliteTodoRepository(db);
  const recurringExpenses = new SqliteRecurringExpenseRepository(db);
  const products = new SqliteProductRepository(db);
  const sponsorships = new SqliteSponsorshipRepository(db);
  const ideas = new SqliteIdeaRepository(db);
  const company = new SqliteCompanyRepository(db);
  const legalObligations = new SqliteLegalObligationRepository(db);
  const legalBookmarks = new SqliteLegalBookmarkRepository(db);
  const affiliatePlatforms = new SqliteAffiliatePlatformRepository(db);
  const instagramAccounts = new SqliteInstagramAccountRepository(db);
  const instagramData = new SqliteInstagramDataRepository(db);
  const workHours = new SqliteWorkHoursRepository(db);
  const planningSettings = new SqlitePlanningSettingsRepository(db);
  const planningItems = new SqlitePlanningItemRepository(db);

  // Partagé : le planning enregistre une session de travail à chaque approbation, et
  // ce doit être exactement le même chemin que le chronomètre de la fiche.
  const trackTime = new TrackTime(timeEntries);

  const manageProducts = new ManageProducts(products, productions, brands, revenues);
  const manageSponsorships = new ManageSponsorships(sponsorships, productions, brands, revenues);

  // Les échéances à venir sont projetées au démarrage : l'écran des dépenses doit
  // montrer ce qui arrive même si aucune écriture n'a eu lieu depuis des semaines.
  const syncRecurringExpenses = new SyncRecurringExpenses(recurringExpenses, expenses);
  syncRecurringExpenses.execute();

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
    timeEntries,
    todos,
    recurringExpenses,
    products,
    sponsorships,
    ideas,
    company,
    legalObligations,
    legalBookmarks,
    affiliatePlatforms,
    instagramAccounts,
    instagramData,
    workHours,
    planningSettings,
    planningItems,
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
      productionSteps,
      timeEntries,
    ),
    manageTodos: new ManageTodos(todos, productions, planningItems),
    trackTime,
    managePlanning: new ManagePlanning(
      planningItems,
      workHours,
      planningSettings,
      productionSlots,
      productions,
      productionSteps,
      todos,
      trackTime,
      (baseUrl, token) => new HomeAssistantClient(baseUrl, token),
    ),
    syncRecurringExpenses,
    getLegalOverview: new GetLegalOverview(company, legalObligations),
    collectMetrics: new CollectMetrics(channels, metrics, videos, {
      youtubeApiKey: config.youtubeApiKey,
      gcpClientId: config.gcpClientId,
      gcpClientSecret: config.gcpClientSecret,
      backfillDays: config.backfillDays,
    }),
    collectInstagram: new CollectInstagram(instagramAccounts, instagramData, {
      appId: config.metaAppId,
      appSecret: config.metaAppSecret,
    }),
    getInstagramOverview: new GetInstagramOverview(instagramAccounts, instagramData),
    getAnalytics: new GetAnalytics(channels, metrics, revenues, categories, expenses, videos),
    youtubeData: config.youtubeApiKey ? new YouTubeDataClient(config.youtubeApiKey) : null,
  };
};
