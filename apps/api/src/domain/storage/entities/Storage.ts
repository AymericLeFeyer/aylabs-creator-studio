/** Les actions de purge que l'écran Stockage propose. Liste fermée : chacune a sa règle. */
export const STORAGE_PURGE_KINDS = [
  'thumbnail_history',
  'mail_attachments',
  'published_videos',
  'orphan_files',
] as const;
export type StoragePurgeKind = (typeof STORAGE_PURGE_KINDS)[number];

export type StorageGroup = 'images' | 'mails' | 'videos' | 'base';

/**
 * Ce qu'une purge libérerait, pour un seuil d'âge donné. `olderThanDays: 0` = tout ce qui
 * est purgeable, sans condition d'âge.
 */
export interface StoragePurgeOption {
  olderThanDays: number;
  count: number;
  bytes: number;
}

export interface StoragePurge {
  kind: StoragePurgeKind;
  label: string;
  /** Ce qui est gardé et pourquoi : l'écran le dit avant de confirmer. */
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
  /** Taille de la table **et de ses index**. */
  bytes: number;
}

export interface StorageOverview {
  generatedAt: string;
  disk: { totalBytes: number; freeBytes: number } | null;
  database: {
    fileBytes: number;
    walBytes: number;
    /** Pages occupées par des données. */
    usedBytes: number;
    /** Pages libres : récupérables en compactant la base. */
    reclaimableBytes: number;
  };
  uploads: { files: number; bytes: number; missingFiles: number };
  /** Base + journal + vidéos déposées. */
  totalBytes: number;
  categories: StorageCategory[];
  tables: StorageTable[];
}

export interface StoragePurgeResult {
  kind: StoragePurgeKind;
  deleted: number;
  freedBytes: number;
  compacted: boolean;
  /** Taille de la base avant et après compactage, pour dire ce qui a vraiment été rendu. */
  databaseBytesBefore: number;
  databaseBytesAfter: number;
}
