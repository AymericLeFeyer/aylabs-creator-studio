/**
 * Contrat de `/api/tiktok`, dupliqué depuis l'API comme tout le reste du front.
 * **Toute évolution doit être répercutée des deux côtés.**
 */

export interface TikTokSnapshot {
  accountId: string;
  date: string;
  followersCount: number | null;
  followingCount: number | null;
  heartCount: number | null;
  videoCount: number | null;
}

export interface TikTokAccount {
  id: string;
  username: string;
  name: string | null;
  profilePicture: string | null;
  color: string;
  isArchived: boolean;
  /** Compte dans `/api/export` (Paramètres → API). Réglable indépendamment de l'archivage. */
  exportEnabled: boolean;
  lastCollectedAt: string | null;
  latestSnapshot: TikTokSnapshot | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateTikTokAccountInput {
  username?: string;
  name?: string | null;
  color?: string;
  isArchived?: boolean;
  exportEnabled?: boolean;
}

export interface TikTokVideo {
  id: string;
  accountId: string;
  videoId: string;
  description: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: string;
  date: string;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** `null` tant qu'aucune collecte n'a mesuré la vidéo. */
  statsAt: string | null;
}

export interface TikTokSeriesPoint {
  date: string;
  videos: number;
  /** CUMUL : dernière valeur connue du bucket, reportée sur les jours sans relevé. */
  followers: number | null;
  followersGained: number | null;
  hearts: number | null;
}

export interface TikTokTotals {
  videos: number;
  followers: number | null;
  followersGained: number | null;
  hearts: number | null;
  days: number;
}

export interface TikTokOverview {
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
  accounts: TikTokAccount[];
  series: TikTokSeriesPoint[];
  totals: TikTokTotals;
  previousTotals: TikTokTotals;
  videos: TikTokVideo[];
  /** Les 10 dernières vidéos, **hors période** (comptes filtrés seulement). */
  latestVideos: TikTokVideo[];
}

export interface TikTokCollectResult {
  username: string;
  followers: number | null;
  following: number | null;
  hearts: number | null;
  source: 'json';
  approximate: boolean;
  videosListed: number;
}

/** « 1 234 » — mêmes compteurs qu'Instagram, même lecture. */
export const formatCount = (value: number | null): string =>
  value === null ? '—' : value.toLocaleString('fr-FR');
