import { request } from '../../http/httpClient.ts';
import type {
  StorageOverview,
  StoragePurgeKind,
  StoragePurgeResult,
} from '../../../domain/storage/entities/Storage.ts';

export const storageApi = {
  overview: () => request<StorageOverview>('/api/storage'),
  purge: (body: { kind: StoragePurgeKind; olderThanDays: number; compact: boolean }) =>
    request<StoragePurgeResult>('/api/storage/purge', { method: 'POST', body }),
  compact: () =>
    request<{ databaseBytesBefore: number; databaseBytesAfter: number }>('/api/storage/compact', {
      method: 'POST',
    }),
};
