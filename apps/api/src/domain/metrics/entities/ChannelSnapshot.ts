import type { IsoDate } from '../../../shared/dates.ts';

export type SnapshotSource = 'youtube_data' | 'manual';

/**
 * Totaux CUMULÉS d'une chaîne observés à un instant (photo de la chaîne).
 * Un seul snapshot est conservé par jour et par chaîne : le plus récent gagne.
 *
 * Attention : ces valeurs ne s'additionnent pas dans le temps. Pour agréger plusieurs
 * chaînes on somme les derniers snapshots de chacune ; pour une évolution on prend
 * la dernière valeur du bucket, jamais la somme des jours.
 */
export interface ChannelSnapshot {
  channelId: string;
  date: IsoDate;
  capturedAt: string;
  subscribers: number;
  totalViews: number;
  totalVideos: number;
  source: SnapshotSource;
}
