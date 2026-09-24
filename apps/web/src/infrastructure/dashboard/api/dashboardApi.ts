import { request } from '../../http/httpClient.ts';
import type {
  DashboardWidget,
  DashboardWidgetCreate,
  DashboardWidgetUpdate,
} from '../../../domain/dashboard/entities/DashboardWidget.ts';

export const dashboardApi = {
  list: () => request<DashboardWidget[]>('/api/dashboard/widgets'),

  create: (input: DashboardWidgetCreate) =>
    request<DashboardWidget>('/api/dashboard/widgets', { method: 'POST', body: input }),

  update: (id: string, input: DashboardWidgetUpdate) =>
    request<DashboardWidget>(`/api/dashboard/widgets/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/dashboard/widgets/${id}`, { method: 'DELETE' }),

  reorder: (ids: string[]) =>
    request<DashboardWidget[]>('/api/dashboard/widgets/reorder', {
      method: 'POST',
      body: { ids },
    }),
};
