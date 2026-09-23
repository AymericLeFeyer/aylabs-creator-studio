import type { IsoDate } from '../../../shared/dates.ts';
import type {
  TikTokAccount,
  TikTokAccountView,
  TikTokSnapshot,
  TikTokVideo,
  UpdateTikTokAccountInput,
} from '../entities/TikTokAccount.ts';

export interface TikTokAccountRepository {
  findAll(includeArchived?: boolean): TikTokAccountView[];
  findById(id: string): TikTokAccount | null;
  findByUsername(username: string): TikTokAccount | null;
  create(input: { username: string; name: string | null }): TikTokAccount;
  update(id: string, input: UpdateTikTokAccountInput): TikTokAccount;
  delete(id: string): void;
}

export interface TikTokRange {
  from: IsoDate;
  to: IsoDate;
}

export interface TikTokDataFilter {
  accountIds?: string[];
  range?: TikTokRange;
  limit?: number;
}

export interface UpsertTikTokVideoInput {
  accountId: string;
  videoId: string;
  description: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: string;
  date: IsoDate;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
}

export interface TikTokDataRepository {
  // --- Relevés du compte (CUMUL) -------------------------------------------
  upsertSnapshot(input: TikTokSnapshot): void;
  findSnapshots(filter: TikTokDataFilter): TikTokSnapshot[];
  /** Dernier relevé **antérieur** à une date, pour calculer un gain d'abonnés. */
  findSnapshotBefore(accountIds: string[], date: IsoDate): TikTokSnapshot[];

  // --- Vidéos -----------------------------------------------------------------
  /**
   * Écrit la vidéo **et** ses compteurs d'un coup : contrairement à Instagram, la page
   * publique de TikTok rend tout en une seule lecture, il n'y a pas de second appel
   * d'insights à orchestrer.
   */
  upsertVideo(input: UpsertTikTokVideoInput): TikTokVideo;
  findVideos(filter: TikTokDataFilter): TikTokVideo[];
  countVideosByDate(filter: TikTokDataFilter): Map<IsoDate, number>;
}
