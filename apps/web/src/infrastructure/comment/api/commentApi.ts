import { request } from '../../http/httpClient.ts';
import type {
  Comment,
  CommentCollectResult,
  CommentCounts,
  CommentStatus,
} from '../../../domain/comment/entities/Comment.ts';

export interface CommentListParams {
  statuses?: CommentStatus[];
  channelIds?: string[];
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
}

const csv = (values?: string[]): string | undefined =>
  values && values.length > 0 ? values.join(',') : undefined;

export const commentApi = {
  list: (params: CommentListParams = {}) =>
    request<Comment[]>('/api/comments', {
      query: {
        statuses: csv(params.statuses),
        channelIds: csv(params.channelIds),
        from: params.from,
        to: params.to,
        search: params.search || undefined,
        limit: params.limit,
      },
    }),

  /** Compte par statut, pour les pastilles des onglets sans charger les lignes. */
  stats: (channelIds?: string[]) =>
    request<CommentCounts>('/api/comments/stats', { query: { channelIds: csv(channelIds) } }),

  setStatus: (id: string, status: CommentStatus) =>
    request<Comment>(`/api/comments/${id}`, { method: 'PATCH', body: { status } }),

  collect: () => request<CommentCollectResult[]>('/api/comments/collect', { method: 'POST' }),
};
