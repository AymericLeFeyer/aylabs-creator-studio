import { request } from '../../http/httpClient.ts';
import type { Idea, IdeaInput } from '../../../domain/idea/entities/Idea.ts';

export const ideaApi = {
  list: () => request<Idea[]>('/api/ideas'),

  create: (input: IdeaInput) => request<Idea>('/api/ideas', { method: 'POST', body: input }),

  update: (id: string, input: Partial<IdeaInput>) =>
    request<Idea>(`/api/ideas/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/ideas/${id}`, { method: 'DELETE' }),
};
