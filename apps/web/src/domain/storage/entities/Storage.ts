/** Contrat de `/api/storage`, dupliqué de l'API (voir CLAUDE.md : pas de package partagé). */
export type StoragePurgeKind =
  'thumbnail_history' | 'mail_attachments' | 'published_videos' | 'orphan_files';

export type StorageGroup = 'images' | 'mails' | 'videos' | 'base';

export interface StoragePurgeOption {
  /** 0 = tout ce qui est purgeable, sans condition d'âge. */
  olderThanDays: number;
  count: number;
  bytes: number;
}

export interface StoragePurge {
  kind: StoragePurgeKind;
  label: string;
  keeps: string;
  options: StoragePurgeOption[];
}

export interface StorageCategory {
  id: string;
  group: StorageGroup;
  label: string;
  description: string;
  count: number;
  bytes: number;
  purge: StoragePurge | null;
}

export interface StorageTable {
  name: string;
  rows: number;
  bytes: number;
}

export interface StorageOverview {
  generatedAt: string;
  disk: { totalBytes: number; freeBytes: number } | null;
  database: { fileBytes: number; walBytes: number; usedBytes: number; reclaimableBytes: number };
  uploads: { files: number; bytes: number; missingFiles: number };
  totalBytes: number;
  categories: StorageCategory[];
  tables: StorageTable[];
}

export interface StoragePurgeResult {
  kind: StoragePurgeKind;
  deleted: number;
  freedBytes: number;
  compacted: boolean;
  databaseBytesBefore: number;
  databaseBytesAfter: number;
}

export const STORAGE_GROUP_LABELS: Record<StorageGroup, string> = {
  images: 'Images',
  mails: 'Mails',
  videos: 'Vidéos',
  base: 'Base',
};

export const STORAGE_GROUP_ORDER: StorageGroup[] = ['images', 'mails', 'videos'];

/** « 3 Mo », « 1,2 Go » : la taille lisible d'un nombre d'octets. */
export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toLocaleString('fr-FR', { maximumFractionDigits: digits })} ${units[unit]}`;
};
