import type {
  StorageOverview,
  StoragePurgeKind,
  StoragePurgeResult,
} from '../../../domain/storage/entities/Storage.ts';
import type { StorageRepository } from '../../../domain/storage/repositories/StorageRepository.ts';
import { conflict } from '../../../shared/errors.ts';

/**
 * Paramètres → Stockage : ce que le studio garde (base et vidéos déposées), et de quoi
 * le purger. Aucune purge ne touche à ce qui sert encore : chaque règle vit dans le dépôt,
 * à côté de la requête qui la compte, pour que le chiffre annoncé soit celui retiré.
 */
export class ManageStorage {
  private readonly repository: StorageRepository;
  /** Une purge ou un compactage à la fois : deux `VACUUM` ne se croisent pas. */
  private busy = false;

  constructor(repository: StorageRepository) {
    this.repository = repository;
  }

  overview(): StorageOverview {
    const database = this.repository.database();
    const uploads = this.repository.uploads();
    return {
      generatedAt: new Date().toISOString(),
      disk: this.repository.disk(),
      database,
      uploads,
      totalBytes: database.fileBytes + database.walBytes + uploads.bytes,
      categories: this.repository.categories(),
      tables: this.repository.tables(),
    };
  }

  purge(kind: StoragePurgeKind, olderThanDays: number, compact: boolean): StoragePurgeResult {
    return this.exclusive(() => {
      const before = this.repository.database().fileBytes;
      const { deleted, freedBytes } = this.repository.purge(kind, olderThanDays);
      let compacted = false;
      // Supprimer des BLOB ne rétrécit pas le fichier : les pages passent à la liste des
      // pages libres. Sans compactage, la purge se verrait dans les chiffres de l'écran
      // mais pas sur le disque.
      if (compact && deleted > 0 && kind !== 'published_videos' && kind !== 'orphan_files') {
        this.repository.compact();
        compacted = true;
      }
      return {
        kind,
        deleted,
        freedBytes,
        compacted,
        databaseBytesBefore: before,
        databaseBytesAfter: this.repository.database().fileBytes,
      };
    });
  }

  compact(): { databaseBytesBefore: number; databaseBytesAfter: number } {
    return this.exclusive(() => {
      const before = this.repository.database().fileBytes;
      this.repository.compact();
      return {
        databaseBytesBefore: before,
        databaseBytesAfter: this.repository.database().fileBytes,
      };
    });
  }

  private exclusive<T>(work: () => T): T {
    if (this.busy) throw conflict('Une opération de stockage est déjà en cours');
    this.busy = true;
    try {
      return work();
    } finally {
      this.busy = false;
    }
  }
}
