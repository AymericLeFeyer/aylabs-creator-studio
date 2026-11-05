import { request, uploadFile } from '../../http/httpClient.ts';
import type {
  PrepareInstagramInput,
  PublishAttempt,
  PublishTargets,
  PublishUpload,
  PublishUploadView,
  StartYouTubeInput,
  YouTubeThumbnailSource,
} from '../../../domain/publish/entities/Publish.ts';

export const publishApi = {
  targets: () => request<PublishTargets>('/api/publish/targets'),
  uploads: () => request<PublishUploadView[]>('/api/publish/uploads'),
  upload: (file: File, onProgress?: (fraction: number) => void) =>
    uploadFile<PublishUpload>('/api/publish/uploads', file, onProgress),
  delete: (id: string) => request<void>(`/api/publish/uploads/${id}`, { method: 'DELETE' }),
  youtube: (uploadId: string, input: StartYouTubeInput) =>
    request<PublishAttempt>(`/api/publish/uploads/${uploadId}/youtube`, {
      method: 'POST',
      body: input,
    }),
  youtubeThumbnail: (attemptId: string, source: YouTubeThumbnailSource) =>
    request<PublishAttempt>(`/api/publish/attempts/${attemptId}/youtube-thumbnail`, {
      method: 'POST',
      body: source,
    }),
  prepareInstagram: (uploadId: string, input: PrepareInstagramInput) =>
    request<PublishAttempt>(`/api/publish/uploads/${uploadId}/instagram`, {
      method: 'POST',
      body: input,
    }),
  publishInstagram: (attemptId: string) =>
    request<PublishAttempt>(`/api/publish/attempts/${attemptId}/instagram-publish`, {
      method: 'POST',
      body: { confirm: true },
    }),
};
