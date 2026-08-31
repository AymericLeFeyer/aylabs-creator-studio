import { request } from '../../http/httpClient.ts';
import type {
  Category,
  CategoryInput,
  CategoryScope,
} from '../../../domain/category/entities/Category.ts';

export interface CategoryListParams {
  includeArchived?: boolean;
  /** Restreint au côté demandé ; les catégories `both` répondent toujours. */
  scope?: CategoryScope;
}

export const categoryApi = {
  list: (params: CategoryListParams = {}) =>
    request<Category[]>('/api/categories', {
      query: { includeArchived: params.includeArchived, scope: params.scope },
    }),

  create: (input: CategoryInput) =>
    request<Category>('/api/categories', { method: 'POST', body: input }),

  update: (id: string, input: Partial<CategoryInput>) =>
    request<Category>(`/api/categories/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/categories/${id}`, { method: 'DELETE' }),
};
