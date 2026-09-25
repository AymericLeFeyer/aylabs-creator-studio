/**
 * Les lectures brutes dont les achievements ont besoin, à travers trois plateformes. Un
 * port à part plutôt que dix méthodes ajoutées aux dépôts existants : ce sont des
 * lectures d'historique complet, sans période, qu'aucun autre écran ne fait.
 *
 * Comptes et chaînes **archivés exclus** : un palier d'une chaîne abandonnée n'a rien à
 * faire au tableau d'honneur.
 */
export interface AchievementEntity {
  id: string;
  name: string;
  color: string;
}

export interface YouTubeDailyRow {
  date: string;
  views: number;
  watchMinutes: number;
  subscribersNet: number;
  /** Au moins un gain ou une perte ce jour-là : la chaîne mesure ses abonnés (OAuth). */
  hasSubscriberFlux: boolean;
  revenueCents: number;
}

export interface YouTubeSnapshotRow {
  date: string;
  subscribers: number;
  totalViews: number;
  totalVideos: number;
}

export interface DatedItem {
  date: string;
  title: string | null;
  /** Vues, j'aime… selon la source : ce qui sert au record. */
  score: number | null;
}

export interface AchievementSourceRepository {
  youtubeChannels(): AchievementEntity[];
  youtubeDaily(channelId: string): YouTubeDailyRow[];
  youtubeSnapshots(channelId: string): YouTubeSnapshotRow[];
  /** Vidéos non supprimées, `score` = vues cumulées. */
  youtubeVideos(channelId: string): DatedItem[];

  instagramAccounts(): AchievementEntity[];
  instagramSnapshots(
    accountId: string,
  ): Array<{ date: string; followers: number | null; mediaCount: number | null }>;
  /** Publications, `score` = j'aime. */
  instagramMedia(accountId: string): DatedItem[];
  instagramStoryDates(accountId: string): string[];
  instagramReach(accountId: string): Array<{ date: string; reach: number }>;

  tiktokAccounts(): AchievementEntity[];
  tiktokSnapshots(
    accountId: string,
  ): Array<{ date: string; followers: number | null; hearts: number | null }>;
  /** Vidéos archivées, `score` = vues. */
  tiktokVideos(accountId: string): DatedItem[];
}
