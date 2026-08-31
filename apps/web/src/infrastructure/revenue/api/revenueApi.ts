import { request } from '../../http/httpClient.ts';
import type { RevenueEntry, RevenueEntryInput } from '../../../domain/revenue/entities/Revenue.ts';

export interface RevenueListParams {
  from?: string;
  to?: string;
  channelIds?: string[];
}

export const revenueApi = {
  list: (params: RevenueListParams = {}) =>
    request<RevenueEntry[]>('/api/revenues', {
      query: {
        from: params.from,
        to: params.to,
        channelIds: params.channelIds?.length ? params.channelIds.join(',') : undefined,
      },
    }),

  create: (input: RevenueEntryInput) =>
    request<RevenueEntry>('/api/revenues', { method: 'POST', body: input }),

  update: (id: string, input: Partial<RevenueEntryInput>) =>
    request<RevenueEntry>(`/api/revenues/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/revenues/${id}`, { method: 'DELETE' }),
};
