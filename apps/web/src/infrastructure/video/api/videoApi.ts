import { request } from '../../http/httpClient.ts';
import type { Video } from '../../../domain/video/entities/Video.ts';

export interface VideoListParams {
  from?: string;
  to?: string;
  channelIds?: string[];
  limit?: number;
  /** Écarte les Shorts (les vidéos pas encore classées restent). */
  excludeShorts?: boolean;
}

export const videoApi = {
  list: (params: VideoListParams = {}) =>
    request<Video[]>('/api/videos', {
      query: {
        from: params.from,
        to: params.to,
        channelIds: params.channelIds?.length ? params.channelIds.join(',') : undefined,
        limit: params.limit,
        excludeShorts: params.excludeShorts ? 'true' : undefined,
      },
    }),
};
