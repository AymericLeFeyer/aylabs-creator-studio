import { request } from '../../http/httpClient.ts';
import type {
  Channel,
  ChannelInput,
  CollectResult,
  ResolvedChannel,
} from '../../../domain/channel/entities/Channel.ts';

export interface ManualMetricInput {
  date: string;
  views: number;
  watchMinutes: number;
  subscribersGained: number;
  subscribersLost: number;
  likes: number;
  comments: number;
  shares: number;
  /** En euros ; l'API convertit en centimes. */
  estimatedRevenue: number;
}

export interface ManualSnapshotInput {
  date: string;
  subscribers: number;
  totalViews: number;
  totalVideos: number;
}

export const channelApi = {
  list: (includeArchived = false) =>
    request<Channel[]>('/api/channels', { query: { includeArchived } }),

  create: (input: ChannelInput) =>
    request<Channel>('/api/channels', { method: 'POST', body: input }),

  update: (id: string, input: Partial<ChannelInput>) =>
    request<Channel>(`/api/channels/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/channels/${id}`, { method: 'DELETE' }),

  /** Traduit un @handle ou une URL en identifiant de chaîne avant création. */
  resolve: (query: string) =>
    request<ResolvedChannel>('/api/channels/resolve', { method: 'POST', body: { query } }),

  collect: (id: string) =>
    request<CollectResult>(`/api/channels/${id}/collect`, { method: 'POST' }),

  saveMetrics: (id: string, input: ManualMetricInput) =>
    request<unknown>(`/api/channels/${id}/metrics`, { method: 'PUT', body: input }),

  saveSnapshot: (id: string, input: ManualSnapshotInput) =>
    request<unknown>(`/api/channels/${id}/snapshots`, { method: 'PUT', body: input }),
};
