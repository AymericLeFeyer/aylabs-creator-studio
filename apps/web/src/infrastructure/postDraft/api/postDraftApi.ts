import { request, uploadFile } from '../../http/httpClient.ts';
import type {
  CoverSource,
  PostDraft,
  PostDraftInput,
  PostDraftSummary,
  PostDraftUpdate,
  PrepareVideoPostsInput,
} from '../../../domain/postDraft/entities/PostDraft.ts';
import type { PublishTargets } from '../../../domain/publish/entities/Publish.ts';

export const postDraftApi = {
  list: (archived = false) =>
    request<PostDraft[]>('/api/post-drafts', { query: { archived: archived || undefined } }),

  forProduction: (productionId: string) =>
    request<PostDraft[]>('/api/post-drafts', { query: { productionId } }),

  prepare: (input: PrepareVideoPostsInput) =>
    request<PostDraft[]>('/api/post-drafts/prepare', { method: 'POST', body: input }),

  summary: () => request<PostDraftSummary>('/api/post-drafts/summary'),

  create: (input: PostDraftInput) =>
    request<PostDraft>('/api/post-drafts', { method: 'POST', body: input }),

  update: (id: string, input: PostDraftUpdate) =>
    request<PostDraft>(`/api/post-drafts/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/post-drafts/${id}`, { method: 'DELETE' }),

  /** Avant le lancement, tout part ; après, seules les plateformes en échec repartent. */
  publishNow: (id: string) =>
    request<PostDraft>(`/api/post-drafts/${id}/publish`, { method: 'POST' }),

  /** Sous `/api/publish` : c'est là que nginx admet 2 Go. */
  uploadVideo: (id: string, file: File, onProgress?: (fraction: number) => void) =>
    uploadFile<PostDraft>(`/api/publish/drafts/${id}/video`, file, onProgress),

  removeVideo: (id: string) =>
    request<PostDraft>(`/api/publish/drafts/${id}/video`, { method: 'DELETE' }),

  setCover: (id: string, source: CoverSource) =>
    request<PostDraft>(`/api/publish/drafts/${id}/cover`, { method: 'PUT', body: source }),

  removeCover: (id: string) =>
    request<PostDraft>(`/api/publish/drafts/${id}/cover`, { method: 'DELETE' }),

  targets: () => request<PublishTargets>('/api/publish/targets'),
};
