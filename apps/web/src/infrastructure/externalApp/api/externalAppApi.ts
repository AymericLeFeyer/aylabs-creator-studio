import { request } from '../../http/httpClient.ts';
import type {
  ExternalApp,
  ExternalAppInput,
  TodayTodos,
} from '../../../domain/externalApp/entities/ExternalApp.ts';

export const externalAppApi = {
  list: () => request<ExternalApp[]>('/api/external-apps'),

  create: (input: ExternalAppInput) =>
    request<ExternalApp>('/api/external-apps', { method: 'POST', body: input }),

  update: (id: string, input: Partial<Omit<ExternalAppInput, 'kind'>>) =>
    request<ExternalApp>(`/api/external-apps/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/external-apps/${id}`, { method: 'DELETE' }),

  /** `today` vient du navigateur : c'est lui qui dit ce qui est en retard. */
  todayTodos: (today: string) =>
    request<TodayTodos>('/api/planning/todo-tasks/today', { query: { today } }),
};
