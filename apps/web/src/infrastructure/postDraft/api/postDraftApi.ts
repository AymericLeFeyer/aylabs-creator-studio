import { request } from '../../http/httpClient.ts';
import type { PostDraft, PostDraftInput } from '../../../domain/postDraft/entities/PostDraft.ts';

export const postDraftApi = {
  list: () => request<PostDraft[]>('/api/post-drafts'),

  create: (input: PostDraftInput) =>
    request<PostDraft>('/api/post-drafts', { method: 'POST', body: input }),

  update: (id: string, input: Partial<PostDraftInput>) =>
    request<PostDraft>(`/api/post-drafts/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/post-drafts/${id}`, { method: 'DELETE' }),
};
