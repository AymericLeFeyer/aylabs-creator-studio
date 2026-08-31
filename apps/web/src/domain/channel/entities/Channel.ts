/** Contrat de `GET /api/channels`. Miroir de `apps/api/src/domain/channel/entities/Channel.ts`. */

export type ChannelMode = 'public' | 'oauth' | 'manual';

export interface ChannelSnapshot {
  channelId: string;
  date: string;
  capturedAt: string;
  subscribers: number;
  totalViews: number;
  totalVideos: number;
  source: 'youtube_data' | 'manual';
}

export interface Channel {
  id: string;
  name: string;
  platform: 'youtube';
  mode: ChannelMode;
  externalId: string | null;
  handle: string | null;
  color: string;
  /** Le refresh token n'est jamais renvoyé : seule sa présence est exposée. */
  hasCredentials: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  latestSnapshot: ChannelSnapshot | null;
  lastMetricDate: string | null;
}

export interface ChannelInput {
  name: string;
  mode: ChannelMode;
  externalId?: string | null;
  handle?: string | null;
  color?: string;
  refreshToken?: string | null;
  isArchived?: boolean;
}

export interface ResolvedChannel {
  channelId: string;
  title: string;
  handle: string | null;
  subscribers: number;
  totalViews: number;
  totalVideos: number;
}

export interface CollectResult {
  channelId: string;
  channelName: string;
  status: 'ok' | 'skipped' | 'error';
  message?: string;
  daysUpserted?: number;
  /** Sorties de vidéo enregistrées au passage, pour les repères des graphiques. */
  videosUpserted?: number;
  snapshotDate?: string;
}

/** Libellés des modes, utilisés dans les formulaires et les badges. */
export const CHANNEL_MODE_LABELS: Record<ChannelMode, string> = {
  public: 'Publique',
  oauth: 'OAuth',
  manual: 'Manuelle',
};

export const CHANNEL_MODE_HINTS: Record<ChannelMode, string> = {
  public: 'Abonnés et vues totales via la clé API. Aucun revenu.',
  oauth: 'Historique complet et revenus AdSense. Nécessite un refresh token.',
  manual: 'Aucune collecte automatique, tout est saisi à la main.',
};
