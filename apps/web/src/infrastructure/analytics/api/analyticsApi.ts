import { request } from '../../http/httpClient.ts';
import type { AnalyticsResult, Granularity } from '../../../domain/analytics/entities/Analytics.ts';
import type { CollectResult } from '../../../domain/channel/entities/Channel.ts';

export interface AnalyticsParams {
  from: string;
  to: string;
  granularity: Granularity;
  channelIds: string[];
  includeUnassigned: boolean;
}

export const analyticsApi = {
  get: (params: AnalyticsParams) =>
    request<AnalyticsResult>('/api/analytics', {
      query: {
        from: params.from,
        to: params.to,
        granularity: params.granularity,
        // Liste vide = vue cumulée : on n'envoie pas le paramètre du tout.
        channelIds: params.channelIds.length > 0 ? params.channelIds.join(',') : undefined,
        includeUnassigned: params.includeUnassigned,
      },
    }),

  collectAll: () =>
    request<{ results: CollectResult[] }>('/api/analytics/collect', { method: 'POST' }),
};
