import { request } from '../../http/httpClient.ts';
import type {
  Brand,
  BrandContact,
  BrandContactInput,
  BrandInput,
  BrandStats,
} from '../../../domain/brand/entities/Brand.ts';

export interface BrandStatsParams {
  from?: string;
  to?: string;
  channelIds?: string[];
}

export const brandApi = {
  list: (includeArchived = false) =>
    request<Brand[]>('/api/brands', { query: { includeArchived } }),

  stats: (params: BrandStatsParams = {}) =>
    request<BrandStats[]>('/api/brands/stats', {
      query: {
        from: params.from,
        to: params.to,
        channelIds: params.channelIds?.length ? params.channelIds.join(',') : undefined,
      },
    }),

  create: (input: BrandInput) => request<Brand>('/api/brands', { method: 'POST', body: input }),

  update: (id: string, input: Partial<BrandInput>) =>
    request<Brand>(`/api/brands/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/brands/${id}`, { method: 'DELETE' }),

  contacts: (params: { brandId?: string; search?: string } = {}) =>
    request<BrandContact[]>('/api/brands/contacts', { query: params }),

  createContact: (brandId: string, input: BrandContactInput) =>
    request<BrandContact>(`/api/brands/${brandId}/contacts`, { method: 'POST', body: input }),

  updateContact: (id: string, input: Partial<BrandContactInput>) =>
    request<BrandContact>(`/api/brands/contacts/${id}`, { method: 'PATCH', body: input }),

  removeContact: (id: string) => request<void>(`/api/brands/contacts/${id}`, { method: 'DELETE' }),
};
