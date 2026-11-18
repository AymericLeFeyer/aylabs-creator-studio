import type { StorageCategory, StoragePurgeKind, StorageTable } from '../entities/Storage.ts';

export interface StorageDatabaseStats {
  fileBytes: number;
  walBytes: number;
  usedBytes: number;
  reclaimableBytes: number;
}

export interface StorageRepository {
  database(): StorageDatabaseStats;
  disk(): { totalBytes: number; freeBytes: number } | null;
  tables(): StorageTable[];
  uploads(): { files: number; bytes: number; missingFiles: number };
  categories(): StorageCategory[];
  /** Applique une purge. Rend le nombre d'éléments retirés et les octets libérés. */
  purge(kind: StoragePurgeKind, olderThanDays: number): { deleted: number; freedBytes: number };
  /** `VACUUM` : rend à l'OS les pages libres. */
  compact(): void;
}
