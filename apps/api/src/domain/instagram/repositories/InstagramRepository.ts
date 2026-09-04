import type { IsoDate } from '../../../shared/dates.ts';
import type {
  CreateInstagramAccountInput,
  InstagramAccount,
  InstagramAccountView,
  InstagramDailyMetric,
  InstagramSnapshot,
  UpdateInstagramAccountInput,
} from '../entities/InstagramAccount.ts';
import type {
  InstagramMedia,
  InstagramStory,
  MediaInsightsInput,
  StoryInsightsInput,
  UpsertMediaInput,
  UpsertStoryInput,
} from '../entities/InstagramStory.ts';

export interface InstagramAccountRepository {
  findAll(includeArchived?: boolean): InstagramAccountView[];
  findById(id: string): InstagramAccount | null;
  findByIgUserId(igUserId: string): InstagramAccount | null;
  create(input: CreateInstagramAccountInput): InstagramAccount;
  update(id: string, input: UpdateInstagramAccountInput): InstagramAccount;
  delete(id: string): void;
}

export interface InstagramRange {
  from: IsoDate;
  to: IsoDate;
}

export interface InstagramDataFilter {
  accountIds?: string[];
  range?: InstagramRange;
  limit?: number;
}

export interface InstagramDataRepository {
  // --- Relevés du compte (CUMUL) -------------------------------------------
  upsertSnapshot(input: InstagramSnapshot): void;
  findSnapshots(filter: InstagramDataFilter): InstagramSnapshot[];
  /** Dernier relevé **antérieur** à une date, pour calculer un gain d'abonnés. */
  findSnapshotBefore(accountIds: string[], date: IsoDate): InstagramSnapshot[];

  // --- Compteurs quotidiens (FLUX) -----------------------------------------
  upsertDailyMetric(input: InstagramDailyMetric): void;
  findDailyMetrics(filter: InstagramDataFilter): InstagramDailyMetric[];
  findLastMetricDate(accountId: string): IsoDate | null;

  // --- Stories --------------------------------------------------------------
  /**
   * Insère une story si elle est nouvelle, sans jamais écraser ce qu'on sait déjà.
   *
   * Une story vue une seule fois dans sa fenêtre de 24 h est une ligne définitive : la
   * recollecte ne peut que confirmer ce qu'on a, jamais l'améliorer. Écraser
   * risquerait d'effacer des mesures par une réponse partielle.
   */
  upsertStory(input: UpsertStoryInput): InstagramStory;
  setStoryInsights(id: string, insights: StoryInsightsInput): void;
  findStories(filter: InstagramDataFilter): InstagramStory[];
  /** Comptage par jour, la question à laquelle ce module existe pour répondre. */
  countStoriesByDate(filter: InstagramDataFilter): Map<IsoDate, number>;
  /** Première story archivée : avant elle, un zéro veut dire « pas de collecte ». */
  findFirstStoryDate(accountIds: string[]): IsoDate | null;

  // --- Publications ---------------------------------------------------------
  upsertMedia(input: UpsertMediaInput): InstagramMedia;
  setMediaInsights(id: string, insights: MediaInsightsInput): void;
  findMedia(filter: InstagramDataFilter): InstagramMedia[];
  countMediaByDate(filter: InstagramDataFilter): Map<IsoDate, number>;
  /** Publications à rafraîchir : les plus récentes, dont les chiffres bougent encore. */
  findMediaToRefresh(accountId: string, since: IsoDate): InstagramMedia[];
}
