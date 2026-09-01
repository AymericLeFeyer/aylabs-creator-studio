import { request } from '../../http/httpClient.ts';
import type {
  Product,
  ProductInput,
  ProductStatus,
} from '../../../domain/product/entities/Product.ts';

export interface ProductListParams {
  statuses?: ProductStatus[];
  brandIds?: string[];
  productionIds?: string[];
  channelIds?: string[];
}

const csv = (values?: string[]): string | undefined =>
  values && values.length > 0 ? values.join(',') : undefined;

export const productApi = {
  list: (params: ProductListParams = {}) =>
    request<Product[]>('/api/products', {
      query: {
        statuses: csv(params.statuses),
        brandIds: csv(params.brandIds),
        productionIds: csv(params.productionIds),
        channelIds: csv(params.channelIds),
      },
    }),

  create: (input: ProductInput) =>
    request<Product>('/api/products', { method: 'POST', body: input }),

  update: (id: string, input: Partial<ProductInput>) =>
    request<Product>(`/api/products/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/products/${id}`, { method: 'DELETE' }),
};
