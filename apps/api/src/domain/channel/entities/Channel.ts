import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Mode de collecte d'une chaîne. Détermine quelles métriques sont récupérables :
 * - `public` : clé API YouTube Data partagée -> uniquement les totaux publics
 *   (abonnés, vues cumulées, nb de vidéos). Aucune donnée de revenu.
 * - `oauth`  : refresh token propre à la chaîne -> YouTube Analytics jour par jour,
 *   avec revenus AdSense estimés. Nécessite que la chaîne t'appartienne.
 * - `manual` : aucune collecte automatique, tout est saisi à la main.
 */
export type ChannelMode = 'public' | 'oauth' | 'manual';

export type Platform = 'youtube';

export interface Channel {
  id: string;
  name: string;
  platform: Platform;
  mode: ChannelMode;
  /** Identifiant YouTube de la chaîne (UC...). Requis en mode `public`. */
  externalId: string | null;
  /** Handle @xxx, purement informatif. */
  handle: string | null;
  /** Couleur d'affichage dans les graphiques (hex). */
  color: string;
  /** Refresh token OAuth, requis en mode `oauth`. Jamais renvoyé par l'API. */
  refreshToken: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Vue publique d'une chaîne : le refresh token est remplacé par un simple booléen. */
export type ChannelView = Omit<Channel, 'refreshToken'> & { hasCredentials: boolean };

export const toChannelView = (channel: Channel): ChannelView => {
  const { refreshToken, ...rest } = channel;
  return { ...rest, hasCredentials: Boolean(refreshToken) };
};

export interface CreateChannelInput {
  name: string;
  platform?: Platform;
  mode: ChannelMode;
  externalId?: string | null;
  handle?: string | null;
  color?: string;
  refreshToken?: string | null;
}

export type UpdateChannelInput = Partial<CreateChannelInput> & { isArchived?: boolean };

/** Résultat d'une collecte, tel que renvoyé au front après un refresh. */
export interface CollectResult {
  channelId: string;
  channelName: string;
  status: 'ok' | 'skipped' | 'error';
  message?: string;
  daysUpserted?: number;
  snapshotDate?: IsoDate;
  /** Sorties de vidéo enregistrées au passage, pour les repères des graphiques. */
  videosUpserted?: number;
  /** Vidéos dont les compteurs (vues, abonnés, AdSense) ont été rafraîchis. */
  videoStatsUpdated?: number;
}
