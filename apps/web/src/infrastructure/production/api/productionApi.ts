import { request } from '../../http/httpClient.ts';
import type {
  Production,
  ProductionInput,
  ProductionStatus,
} from '../../../domain/production/entities/Production.ts';
import type { ProductionOverview } from '../../../domain/production/entities/ProductionOverview.ts';
import type {
  ProductionSlot,
  ProductionSlotInput,
} from '../../../domain/production/entities/ProductionSlot.ts';
import type {
  ProductionStep,
  ProductionStepInput,
} from '../../../domain/production/entities/ProductionStep.ts';

export interface ProductionListParams {
  statuses?: ProductionStatus[];
  channelIds?: string[];
  from?: string;
  to?: string;
  search?: string;
}

export interface SlotListParams {
  productionIds?: string[];
  from?: string;
  to?: string;
  includeDone?: boolean;
}

const csv = (values?: string[]): string | undefined =>
  values && values.length > 0 ? values.join(',') : undefined;

export const productionApi = {
  list: (params: ProductionListParams = {}) =>
    request<Production[]>('/api/productions', {
      query: {
        statuses: csv(params.statuses),
        channelIds: csv(params.channelIds),
        from: params.from,
        to: params.to,
        search: params.search || undefined,
      },
    }),

  get: (id: string) => request<Production>(`/api/productions/${id}`),

  overview: () => request<ProductionOverview>('/api/productions/overview'),

  create: (input: ProductionInput) =>
    request<Production>('/api/productions', { method: 'POST', body: input }),

  update: (id: string, input: Partial<ProductionInput>) =>
    request<Production>(`/api/productions/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/productions/${id}`, { method: 'DELETE' }),

  /** L'ordre complet de la file : le rang est la position dans le tableau envoyé. */
  reorder: (ids: string[]) =>
    request<void>('/api/productions/reorder', { method: 'POST', body: { ids } }),

  publish: (id: string, videoId: string) =>
    request<Production>(`/api/productions/${id}/publish`, { method: 'POST', body: { videoId } }),

  checkStep: (id: string, stepId: string) =>
    request<void>(`/api/productions/${id}/steps/${stepId}`, { method: 'PUT' }),

  uncheckStep: (id: string, stepId: string) =>
    request<void>(`/api/productions/${id}/steps/${stepId}`, { method: 'DELETE' }),
};

export const productionStepApi = {
  list: (includeArchived = false) =>
    request<ProductionStep[]>('/api/production-steps', { query: { includeArchived } }),

  create: (input: ProductionStepInput) =>
    request<ProductionStep>('/api/production-steps', { method: 'POST', body: input }),

  update: (id: string, input: Partial<ProductionStepInput>) =>
    request<ProductionStep>(`/api/production-steps/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/production-steps/${id}`, { method: 'DELETE' }),
};

export const productionSlotApi = {
  list: (params: SlotListParams = {}) =>
    request<ProductionSlot[]>('/api/production-slots', {
      query: {
        productionIds: csv(params.productionIds),
        from: params.from,
        to: params.to,
        includeDone: params.includeDone,
      },
    }),

  create: (input: ProductionSlotInput) =>
    request<ProductionSlot>('/api/production-slots', { method: 'POST', body: input }),

  update: (id: string, input: Partial<Omit<ProductionSlotInput, 'productionId'>>) =>
    request<ProductionSlot>(`/api/production-slots/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/production-slots/${id}`, { method: 'DELETE' }),
};
