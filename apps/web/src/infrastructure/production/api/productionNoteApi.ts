import { request } from '../../http/httpClient.ts';
import type {
  ProductionNote,
  ProductionNoteInput,
} from '../../../domain/production/entities/ProductionNote.ts';

const base = (productionId: string) => `/api/productions/${productionId}/notes`;

export const productionNoteApi = {
  list: (productionId: string) => request<ProductionNote[]>(base(productionId)),

  create: (productionId: string, input: ProductionNoteInput) =>
    request<ProductionNote>(base(productionId), { method: 'POST', body: input }),

  update: (productionId: string, id: string, input: ProductionNoteInput) =>
    request<ProductionNote>(`${base(productionId)}/${id}`, { method: 'PATCH', body: input }),

  remove: (productionId: string, id: string) =>
    request<void>(`${base(productionId)}/${id}`, { method: 'DELETE' }),
};
