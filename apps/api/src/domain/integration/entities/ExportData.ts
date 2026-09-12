/**
 * La forme de ce que publie `/api/export`.
 *
 * **Les clés reprennent celles de l'ancien YouTube-Money-Exporter** (`thisMonth`,
 * `last30days`, `lastVideo.stats.viewCount`, `members_online`…) : une configuration
 * Home Assistant existante continue de fonctionner en changeant seulement l'adresse et
 * l'en-tête d'authentification.
 *
 * Une différence volontaire : les valeurs sont des **nombres**, plus des chaînes
 * formatées (`"12,34 €"`). Les gabarits Home Assistant existants passent toujours — les
 * filtres `replace` et `float` acceptent un nombre — et les nouveaux n'ont plus à
 * défaire une mise en forme. Les montants sont en **euros** : c'est un contrat de
 * sortie, pas le domaine, et un capteur `monetary` attend des euros.
 */

export interface YouTubePeriodExport {
  from: string;
  to: string;
  views: number;
  estimatedHoursWatched: number;
  /** En minutes, pondérée par les vues de chaque jour et de chaque chaîne. */
  averageViewDuration: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
  shares: number;
  /** En euros. */
  estimatedRevenue: number;
}

export interface YouTubeExport {
  lastUpdate: string | null;
  total: { subscribers: number; views: number; videos: number };
  thisMonth: YouTubePeriodExport;
  last30days: YouTubePeriodExport;
  lastVideo: {
    title: string;
    url: string;
    thumbnail: string;
    publishedAt: string;
    channelName: string;
    /** `null` tant qu'aucune collecte n'a mesuré la vidéo. */
    stats: { viewCount: number; likeCount: number; commentCount: number } | null;
  } | null;
  channels: Array<{ name: string; subscribers: number }>;
}

export interface InstagramExport {
  lastUpdate: string | null;
  /** Le premier compte suivi, comme l'unique compte de l'ancien outil. */
  username: string;
  followers: number;
  following: number;
  posts: number;
  accounts: Array<{ username: string; followers: number; following: number; posts: number }>;
}

export interface AmazonExport {
  thisMonth: {
    clicks: number | null;
    itemsOrdered: number | null;
    itemsShipped: number | null;
    itemsReturned: number | null;
    /** En pourcentage (`4.2` pour 4,2 %). */
    conversionRate: number | null;
    sumItemsShipped: number | null;
    earnings: number | null;
  };
  waitingPayments: number | null;
}

export interface DomadooSale {
  id: string;
  date: string;
  order: number | null;
  commission: number | null;
  approved: boolean;
}

export interface DomadooExport {
  last30days: {
    clicks: number | null;
    uniquesClicks: number | null;
    waitingSales: number | null;
    approvedSales: number | null;
    earnings: number | null;
    /** Somme des commissions en attente, tirée du relevé quotidien des ventes. */
    waitingSalesTotal: number | null;
  };
  total: {
    clicks: number | null;
    uniquesClicks: number | null;
    approvedSales: number | null;
    earnings: number | null;
    payments: number | null;
    waitingPayments: number | null;
    balance: number | null;
  };
  lastSales: DomadooSale[];
}

/** Le résumé horaire, avant qu'on y ajoute le total des ventes relevées chaque jour. */
export type DomadooSummary = Omit<DomadooExport, 'last30days'> & {
  last30days: Omit<DomadooExport['last30days'], 'waitingSalesTotal'>;
};

export interface DiscordExport {
  name: string;
  members: number | null;
  members_online: number | null;
}

/** Une source publiée, avec l'heure de la donnée qu'elle porte. */
export type ExportEntry = Record<string, unknown> & { lastUpdate: string | null };

export interface ExportPayload {
  generatedAt: string;
  youtube: ExportEntry | null;
  instagram: ExportEntry | null;
  amazon: ExportEntry | null;
  domadoo: ExportEntry | null;
  discord: ExportEntry | null;
}
