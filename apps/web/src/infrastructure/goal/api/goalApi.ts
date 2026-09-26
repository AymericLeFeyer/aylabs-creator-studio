import { request } from '../../http/httpClient.ts';
import type {
  GoalCatalog,
  GoalInput,
  GoalPreview,
  GoalView,
} from '../../../domain/goal/entities/Goal.ts';

export interface GoalPreviewParams {
  metric: string;
  entityId?: string;
  startDate: string;
  endDate?: string;
  today?: string;
}

export const goalApi = {
  list: (today: string) => request<GoalView[]>('/api/goals', { query: { today } }),
  catalog: () => request<GoalCatalog>('/api/goals/catalog'),
  preview: (params: GoalPreviewParams) =>
    request<GoalPreview>('/api/goals/preview', { query: { ...params } }),
  create: (input: GoalInput, today: string) =>
    request<GoalView>('/api/goals', { method: 'POST', body: input, query: { today } }),
  update: (id: string, input: Partial<GoalInput>, today: string) =>
    request<GoalView>(`/api/goals/${id}`, { method: 'PATCH', body: input, query: { today } }),
  remove: (id: string) => request<void>(`/api/goals/${id}`, { method: 'DELETE' }),
};
