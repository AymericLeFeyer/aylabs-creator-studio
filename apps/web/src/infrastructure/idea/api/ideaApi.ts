import { request } from '../../http/httpClient.ts';
import type { Idea, IdeaInput } from '../../../domain/idea/entities/Idea.ts';
import type { ProductionFormat } from '../../../domain/production/entities/Production.ts';

export const ideaApi = {
  list: (format?: ProductionFormat) => request<Idea[]>('/api/ideas', { query: { format } }),

  create: (input: IdeaInput) => request<Idea>('/api/ideas', { method: 'POST', body: input }),

  update: (id: string, input: Partial<IdeaInput>) =>
    request<Idea>(`/api/ideas/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/ideas/${id}`, { method: 'DELETE' }),
};
