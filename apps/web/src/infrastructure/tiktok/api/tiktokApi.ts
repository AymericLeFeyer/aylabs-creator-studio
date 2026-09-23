import { request } from '../../http/httpClient.ts';
import type {
  TikTokAccount,
  TikTokOverview,
  UpdateTikTokAccountInput,
} from '../../../domain/tiktok/entities/TikTok.ts';

export interface TikTokOverviewParams {
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
  accountIds?: string[];
}

const csv = (values?: string[]): string | undefined =>
  values && values.length > 0 ? values.join(',') : undefined;

export const tiktokApi = {
  overview: (params: TikTokOverviewParams) =>
    request<TikTokOverview>('/api/tiktok/overview', {
      query: {
        from: params.from,
        to: params.to,
        granularity: params.granularity,
        accountIds: csv(params.accountIds),
      },
    }),

  accounts: (includeArchived = false) =>
    request<TikTokAccount[]>('/api/tiktok/accounts', { query: { includeArchived } }),

  update: (id: string, input: UpdateTikTokAccountInput) =>
    request<TikTokAccount>(`/api/tiktok/accounts/${id}`, { method: 'PATCH', body: input }),

  /** Supprime le compte **et tout son historique** : pas de rattrapage possible. */
  remove: (id: string) => request<void>(`/api/tiktok/accounts/${id}`, { method: 'DELETE' }),
};
