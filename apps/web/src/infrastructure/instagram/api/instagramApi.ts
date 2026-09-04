import { request } from '../../http/httpClient.ts';
import type {
  InstagramAccount,
  InstagramAccountInput,
  InstagramCollectResult,
  InstagramOverview,
} from '../../../domain/instagram/entities/Instagram.ts';

export interface InstagramOverviewParams {
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
  accountIds?: string[];
}

const csv = (values?: string[]): string | undefined =>
  values && values.length > 0 ? values.join(',') : undefined;

export const instagramApi = {
  overview: (params: InstagramOverviewParams) =>
    request<InstagramOverview>('/api/instagram/overview', {
      query: {
        from: params.from,
        to: params.to,
        granularity: params.granularity,
        accountIds: csv(params.accountIds),
      },
    }),

  accounts: (includeArchived = false) =>
    request<InstagramAccount[]>('/api/instagram/accounts', { query: { includeArchived } }),

  create: (input: InstagramAccountInput) =>
    request<InstagramAccount>('/api/instagram/accounts', { method: 'POST', body: input }),

  update: (id: string, input: Partial<InstagramAccountInput>) =>
    request<InstagramAccount>(`/api/instagram/accounts/${id}`, { method: 'PATCH', body: input }),

  /** Supprime le compte **et tout son historique** : les stories ne se recollectent pas. */
  remove: (id: string) => request<void>(`/api/instagram/accounts/${id}`, { method: 'DELETE' }),

  collectAll: () => request<InstagramCollectResult[]>('/api/instagram/collect', { method: 'POST' }),

  collectOne: (id: string) =>
    request<InstagramCollectResult>(`/api/instagram/accounts/${id}/collect`, { method: 'POST' }),

  /** Échange le jeton contre un neuf, valable 60 jours de plus. */
  refreshToken: (id: string) =>
    request<{ expiresAt: string | null }>(`/api/instagram/accounts/${id}/refresh-token`, {
      method: 'POST',
    }),
};
