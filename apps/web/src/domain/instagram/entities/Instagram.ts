/**
 * Contrat de `/api/instagram`, dupliqué depuis l'API comme tout le reste du front.
 * **Toute évolution doit être répercutée des deux côtés.**
 */

export interface InstagramSnapshot {
  accountId: string;
  date: string;
  followersCount: number | null;
  followsCount: number | null;
  mediaCount: number | null;
}

export interface InstagramAccount {
  id: string;
  username: string;
  name: string | null;
  igUserId: string;
  /** Le jeton lui-même ne sort jamais de l'API : seul son existence est exposée. */
  hasToken: boolean;
  tokenExpiresAt: string | null;
  /** Jours restants avant expiration. Négatif = expiré, `null` = inconnu. */
  tokenDaysLeft: number | null;
  profilePicture: string | null;
  color: string;
  isArchived: boolean;
  lastCollectedAt: string | null;
  latestSnapshot: InstagramSnapshot | null;
  lastMetricDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InstagramAccountInput {
  username: string;
  name?: string | null;
  igUserId: string;
  /** `""` efface le jeton, absent le conserve — même convention que `refreshToken`. */
  accessToken?: string | null;
  color?: string;
  isArchived?: boolean;
}

export interface InstagramStory {
  id: string;
  accountId: string;
  igMediaId: string;
  mediaType: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: string;
  date: string;
  views: number | null;
  reach: number | null;
  replies: number | null;
  /**
   * `null` = jamais mesurée, et ça restera ainsi si la story a été vue par moins de cinq
   * comptes : Meta refuse alors toute statistique. On affiche « — », jamais zéro.
   */
  insightsAt: string | null;
}

export interface InstagramMedia {
  id: string;
  accountId: string;
  igMediaId: string;
  mediaType: string | null;
  caption: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  postedAt: string;
  date: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  saved: number | null;
  shares: number | null;
  /** `null` tant qu'aucune collecte n'a mesuré la publication. */
  statsAt: string | null;
}

export interface InstagramSeriesPoint {
  date: string;
  stories: number;
  posts: number;
  reach: number | null;
  views: number | null;
  totalInteractions: number | null;
  /** CUMUL : dernière valeur connue du bucket, reportée sur les jours sans relevé. */
  followers: number | null;
  followersGained: number | null;
}

export interface InstagramTotals {
  stories: number;
  posts: number;
  reach: number | null;
  views: number | null;
  totalInteractions: number | null;
  followers: number | null;
  followersGained: number | null;
  /** Moyenne sur **tous** les jours de la période, pas sur les jours de publication. */
  storiesPerDay: number;
  storiesPerWeek: number;
  activeDays: number;
  days: number;
}

export interface InstagramDailyMetric {
  accountId: string;
  date: string;
  reach: number | null;
  views: number | null;
  totalInteractions: number | null;
  accountsEngaged: number | null;
  profileLinksTaps: number | null;
}

export interface InstagramOverview {
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
  accounts: InstagramAccount[];
  series: InstagramSeriesPoint[];
  totals: InstagramTotals;
  previousTotals: InstagramTotals | null;
  stories: InstagramStory[];
  media: InstagramMedia[];
  /**
   * Première story jamais archivée. **Avant elle, un zéro veut dire « pas de collecte »**,
   * pas « rien publié » — l'API n'expose les stories que 24 h, rien ne se rattrape.
   */
  firstStoryDate: string | null;
  dailyMetrics: InstagramDailyMetric[];
}

export interface InstagramCollectResult {
  accountId: string;
  username: string;
  storiesFound: number;
  storiesMeasured: number;
  mediaUpserted: number;
  mediaMeasured: number;
  daysCollected: number;
  error: string | null;
}

/** Libellés des types de média renvoyés par Meta. */
export const MEDIA_TYPE_LABELS: Record<string, string> = {
  IMAGE: 'Photo',
  VIDEO: 'Vidéo',
  CAROUSEL_ALBUM: 'Carrousel',
  REELS: 'Reel',
};

/**
 * Le jeton est-il sur le point d'expirer ?
 *
 * Meta ne délivre pas de jeton perpétuel : celui-ci vit 60 jours. Sans alerte, la
 * collecte s'arrêterait un matin sans que rien ne l'ait annoncé — et chaque jour sans
 * collecte est un jour de stories perdu pour toujours.
 */
export const tokenWarning = (account: InstagramAccount): 'expired' | 'soon' | null => {
  if (account.tokenDaysLeft === null) return null;
  if (account.tokenDaysLeft < 0) return 'expired';
  return account.tokenDaysLeft <= 10 ? 'soon' : null;
};

/** « 1 234 » — les compteurs Instagram se lisent en milliers, pas en notation savante. */
export const formatCount = (value: number | null): string =>
  value === null ? '—' : value.toLocaleString('fr-FR');

/** Variation en pourcentage entre deux périodes, `null` si la comparaison n'a pas de sens. */
export const variation = (current: number | null, previous: number | null): number | null => {
  if (current === null || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
};
