import { request } from '../../http/httpClient.ts';
import type {
  AffiliatePlatform,
  AffiliatePlatformInput,
} from '../../../domain/affiliate/entities/AffiliatePlatform.ts';

export interface PlatformListParams {
  includeArchived?: boolean;
  /** Borne `earnedCents`. `totalEarnedCents`, lui, ignore toujours la période. */
  from?: string;
  to?: string;
}

export const affiliateApi = {
  list: (params: PlatformListParams = {}) =>
    request<AffiliatePlatform[]>('/api/affiliate-platforms', {
      query: {
        includeArchived: params.includeArchived ? 'true' : undefined,
        from: params.from,
        to: params.to,
      },
    }),

  create: (input: AffiliatePlatformInput) =>
    request<AffiliatePlatform>('/api/affiliate-platforms', { method: 'POST', body: input }),

  update: (id: string, input: Partial<AffiliatePlatformInput>) =>
    request<AffiliatePlatform>(`/api/affiliate-platforms/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/affiliate-platforms/${id}`, { method: 'DELETE' }),
};
