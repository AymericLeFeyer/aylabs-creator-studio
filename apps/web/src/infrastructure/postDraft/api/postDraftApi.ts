import { request } from '../../http/httpClient.ts';
import type {
  PostDraft,
  PostDraftInput,
  PostDraftSummary,
  PostDraftUpdate,
} from '../../../domain/postDraft/entities/PostDraft.ts';

export const postDraftApi = {
  list: (archived = false) =>
    request<PostDraft[]>('/api/post-drafts', { query: { archived: archived || undefined } }),

  summary: () => request<PostDraftSummary>('/api/post-drafts/summary'),

  create: (input: PostDraftInput) =>
    request<PostDraft>('/api/post-drafts', { method: 'POST', body: input }),

  update: (id: string, input: PostDraftUpdate) =>
    request<PostDraft>(`/api/post-drafts/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/post-drafts/${id}`, { method: 'DELETE' }),
};
