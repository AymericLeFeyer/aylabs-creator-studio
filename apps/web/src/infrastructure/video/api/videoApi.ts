import { request } from '../../http/httpClient.ts';
import type { Video } from '../../../domain/video/entities/Video.ts';

export interface VideoListParams {
  from?: string;
  to?: string;
  channelIds?: string[];
  limit?: number;
  /** `false` : sans les vidéos masquées ; `true` : elles seules ; absent : toutes. */
  hidden?: boolean;
  /** `true` : seulement les directs. */
  live?: boolean;
}

export const videoApi = {
  list: (params: VideoListParams = {}) =>
    request<Video[]>('/api/videos', {
      query: {
        from: params.from,
        to: params.to,
        channelIds: params.channelIds?.length ? params.channelIds.join(',') : undefined,
        limit: params.limit,
        hidden: params.hidden === undefined ? undefined : String(params.hidden),
        live: params.live ? 'true' : undefined,
      },
    }),

  live: (params: { channelIds: string[]; limit: number }) =>
    request<Video[]>('/api/videos/live', { method: 'POST', body: params }),

  setNotLive: (id: string) =>
    request<Video>(`/api/videos/${id}`, { method: 'PATCH', body: { notLive: true } }),

  setHidden: (id: string, hidden: boolean) =>
    request<Video>(`/api/videos/${id}`, { method: 'PATCH', body: { hidden } }),
};
