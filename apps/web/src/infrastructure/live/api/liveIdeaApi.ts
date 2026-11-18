import { request } from '../../http/httpClient.ts';
import type { LiveIdea, LiveIdeaInput } from '../../../domain/live/entities/LiveIdea.ts';

export const liveIdeaApi = {
  list: () => request<LiveIdea[]>('/api/live-ideas'),
  create: (input: LiveIdeaInput) =>
    request<LiveIdea>('/api/live-ideas', { method: 'POST', body: input }),
  update: (id: string, input: Partial<LiveIdeaInput>) =>
    request<LiveIdea>(`/api/live-ideas/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string) => request<void>(`/api/live-ideas/${id}`, { method: 'DELETE' }),
};
