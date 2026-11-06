import { request } from '../../http/httpClient.ts';
import type {
  GenerateThumbnailInput,
  Thumbnail,
  ThumbnailAsset,
  ThumbnailSettingsInput,
  ThumbnailSettingsView,
} from '../../../domain/thumbnail/entities/Thumbnail.ts';

export const thumbnailApi = {
  settings: () => request<ThumbnailSettingsView>('/api/thumbnails/settings'),
  updateSettings: (input: ThumbnailSettingsInput) =>
    request<ThumbnailSettingsView>('/api/thumbnails/settings', { method: 'PATCH', body: input }),
  assets: () => request<ThumbnailAsset[]>('/api/thumbnails/assets'),
  addAsset: (input: { label: string; image: string }) =>
    request<ThumbnailAsset>('/api/thumbnails/assets', { method: 'POST', body: input }),
  fetchImage: (url: string) =>
    request<{ image: string; name: string }>('/api/thumbnails/fetch-image', {
      method: 'POST',
      body: { url },
    }),
  deleteAsset: (id: string) => request<void>(`/api/thumbnails/assets/${id}`, { method: 'DELETE' }),
  list: (productionId: string | null, saved?: boolean) =>
    request<Thumbnail[]>('/api/thumbnails', {
      query: {
        productionId: productionId ?? undefined,
        saved: saved === undefined ? undefined : String(saved),
      },
    }),
  save: (id: string, productionId: string | null) =>
    request<Thumbnail>(`/api/thumbnails/${id}/save`, { method: 'POST', body: { productionId } }),
  unsave: (id: string) => request<Thumbnail>(`/api/thumbnails/${id}/save`, { method: 'DELETE' }),
  generate: (input: GenerateThumbnailInput) =>
    request<Thumbnail>('/api/thumbnails', { method: 'POST', body: input }),
  delete: (id: string) => request<void>(`/api/thumbnails/${id}`, { method: 'DELETE' }),
};
