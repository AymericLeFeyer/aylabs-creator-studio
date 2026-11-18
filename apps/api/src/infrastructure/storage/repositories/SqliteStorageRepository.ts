import type { DatabaseSync } from 'node:sqlite';
import { existsSync, readdirSync, rmSync, statSync, statfsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type {
  StorageCategory,
  StoragePurge,
  StoragePurgeKind,
  StoragePurgeOption,
  StorageTable,
} from '../../../domain/storage/entities/Storage.ts';
import type {
  StorageDatabaseStats,
  StorageRepository,
} from '../../../domain/storage/repositories/StorageRepository.ts';

/** Seuils d'âge proposés pour les purges qui en admettent un. 0 = tout. */
const AGE_STEPS = [0, 30, 90];

/** Les miniatures qu'un test A/B désigne ne sont jamais purgées : elles servent encore. */
const NOT_IN_AB_TEST = `id NOT IN (
  SELECT j.value FROM productions p, json_each(p.ab_test, '$.thumbnailIds') j
   WHERE j.value IS NOT NULL
)`;

/** Les vidéos dont le fichier ne sert plus : mise en ligne lancée, rien en cours, rien en échec. */
const FINISHED_UPLOADS = `SELECT DISTINCT u.id FROM publish_uploads u
  JOIN post_drafts d ON d.upload_id = u.id
 WHERE d.publish_started_at IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM publish_attempts a
      WHERE a.upload_id = u.id
        AND a.status IN ('uploading', 'processing', 'publishing', 'failed')
   )`;

const cutoff = (days: number): string => new Date(Date.now() - days * 86_400_000).toISOString();

interface Pair {
  count: number;
  bytes: number;
}

/**
 * Lectures de la taille de ce que le studio garde, et purges.
 *
 * Les tailles de tables viennent de `dbstat` (pages réellement occupées, index compris) :
 * `SUM(LENGTH(…))` ne verrait ni les index ni les pages à moitié pleines.
 */
export class SqliteStorageRepository implements StorageRepository {
  private readonly db: DatabaseSync;
  private readonly databasePath: string;
  private readonly uploadsDir: string;

  constructor(db: DatabaseSync, databasePath: string, uploadsDir: string) {
    this.db = db;
    this.databasePath = databasePath;
    this.uploadsDir = uploadsDir;
  }

  private pragma(name: string): number {
    const row = this.db.prepare(`PRAGMA ${name}`).get() as Record<string, number> | undefined;
    return row ? Number(Object.values(row)[0]) : 0;
  }

  private fileSize(path: string): number {
    try {
      return statSync(path).size;
    } catch {
      return 0;
    }
  }

  private pair(sql: string, ...params: Array<string | number>): Pair {
    const row = this.db.prepare(sql).get(...params) as { count: number; bytes: number } | undefined;
    return { count: Number(row?.count ?? 0), bytes: Number(row?.bytes ?? 0) };
  }

  database(): StorageDatabaseStats {
    const pageSize = this.pragma('page_size');
    const memory = this.databasePath === ':memory:';
    return {
      fileBytes: memory ? this.pragma('page_count') * pageSize : this.fileSize(this.databasePath),
      walBytes: memory ? 0 : this.fileSize(`${this.databasePath}-wal`),
      usedBytes: (this.pragma('page_count') - this.pragma('freelist_count')) * pageSize,
      reclaimableBytes: this.pragma('freelist_count') * pageSize,
    };
  }

  disk(): { totalBytes: number; freeBytes: number } | null {
    try {
      const stats = statfsSync(
        this.databasePath === ':memory:' ? this.uploadsDir : dirname(this.databasePath),
      );
      return { totalBytes: stats.blocks * stats.bsize, freeBytes: stats.bavail * stats.bsize };
    } catch {
      return null;
    }
  }

  tables(): StorageTable[] {
    const owners = new Map<string, string>();
    const names = this.db
      .prepare("SELECT name, tbl_name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'")
      .all() as Array<{ name: string; tbl_name: string }>;
    for (const row of names) owners.set(row.name, row.tbl_name);

    const sizes = new Map<string, number>();
    const pages = this.db
      .prepare('SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name')
      .all() as Array<{ name: string; bytes: number }>;
    for (const row of pages) {
      const table = owners.get(row.name);
      if (!table) continue;
      sizes.set(table, (sizes.get(table) ?? 0) + Number(row.bytes));
    }

    const tables: StorageTable[] = [];
    for (const [name, bytes] of sizes) {
      const rows = this.db
        .prepare(`SELECT COUNT(*) AS count FROM "${name.replaceAll('"', '""')}"`)
        .get() as {
        count: number;
      };
      tables.push({ name, rows: Number(rows.count), bytes });
    }
    return tables.sort((a, b) => b.bytes - a.bytes);
  }

  /** Les fichiers du dossier des vidéos, par identifiant de dépôt (préfixe avant le point). */
  private files(): Array<{ name: string; id: string; bytes: number }> {
    if (!existsSync(this.uploadsDir)) return [];
    return readdirSync(this.uploadsDir).map((name) => ({
      name,
      id: name.split('.')[0] ?? name,
      bytes: this.fileSize(join(this.uploadsDir, name)),
    }));
  }

  private uploadIds(): Set<string> {
    const rows = this.db.prepare('SELECT id FROM publish_uploads').all() as Array<{ id: string }>;
    return new Set(rows.map((row) => row.id));
  }

  uploads(): { files: number; bytes: number; missingFiles: number } {
    const files = this.files();
    const present = new Set(files.map((file) => file.id));
    const missing = [...this.uploadIds()].filter((id) => !present.has(id)).length;
    return {
      files: files.length,
      bytes: files.reduce((sum, file) => sum + file.bytes, 0),
      missingFiles: missing,
    };
  }

  private options(measure: (days: number) => Pair): StoragePurgeOption[] {
    const options: StoragePurgeOption[] = [];
    for (const days of AGE_STEPS) {
      const { count, bytes } = measure(days);
      // Un seuil qui ne retire rien de plus que le précédent n'apporte rien à l'écran.
      const previous = options.at(-1);
      if (previous && previous.count === count) continue;
      options.push({ olderThanDays: days, count, bytes });
    }
    return options;
  }

  private thumbnailCandidates(days: number): Pair {
    return this.pair(
      `SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM thumbnails
        WHERE saved_at IS NULL AND created_at <= ? AND ${NOT_IN_AB_TEST}`,
      cutoff(days),
    );
  }

  private attachmentCandidates(days: number): Pair {
    return this.pair(
      `SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(a.data)), 0) AS bytes
         FROM mail_attachments a JOIN mail_messages m ON m.id = a.message_id
        WHERE a.data IS NOT NULL AND m.removed_at IS NULL AND a.created_at <= ?`,
      cutoff(days),
    );
  }

  private finishedVideos(): Array<{ path: string; bytes: number }> {
    const finished = new Set(
      (this.db.prepare(FINISHED_UPLOADS).all() as Array<{ id: string }>).map((row) => row.id),
    );
    return this.files()
      .filter((file) => finished.has(file.id))
      .map((file) => ({ path: join(this.uploadsDir, file.name), bytes: file.bytes }));
  }

  private orphanFiles(): Array<{ path: string; bytes: number }> {
    const known = this.uploadIds();
    return this.files()
      .filter((file) => !known.has(file.id))
      .map((file) => ({ path: join(this.uploadsDir, file.name), bytes: file.bytes }));
  }

  private single(count: number, bytes: number): StoragePurgeOption[] {
    return [{ olderThanDays: 0, count, bytes }];
  }

  categories(): StorageCategory[] {
    const thumbs = this.pair(
      'SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM thumbnails',
    );
    const saved = this.pair(
      'SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM thumbnails WHERE saved_at IS NOT NULL',
    );
    const assets = this.pair(
      'SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM thumbnail_assets',
    );
    const workspace = this.pair(
      'SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM production_workspace_images',
    );
    const covers = this.pair(
      'SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM post_draft_covers',
    );
    const icons = this.pair(
      'SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM app_branding_icons',
    );

    const cached = this.pair(
      'SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM mail_attachments WHERE data IS NOT NULL',
    );
    const messages = this.pair(
      `SELECT COUNT(*) AS count,
              COALESCE(SUM(LENGTH(text_body) + LENGTH(COALESCE(html_body, ''))), 0) AS bytes
         FROM mail_messages`,
    );
    const gone = this.pair(
      `SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(a.data)), 0) AS bytes
         FROM mail_attachments a JOIN mail_messages m ON m.id = a.message_id
        WHERE a.data IS NOT NULL AND m.removed_at IS NOT NULL`,
    );

    const files = this.files();
    const finished = this.finishedVideos();
    const orphans = this.orphanFiles();

    const unsaved = this.thumbnailCandidates(0);
    const thumbnailPurge: StoragePurge = {
      kind: 'thumbnail_history',
      label: 'Purger l’historique',
      keeps: 'Les miniatures enregistrées sur une vidéo et celles d’un test A/B sont conservées.',
      options: this.options((days) => this.thumbnailCandidates(days)),
    };
    const attachmentPurge: StoragePurge = {
      kind: 'mail_attachments',
      label: 'Vider le cache',
      keeps: `Seules les pièces jointes dont le mail est encore sur le serveur sont vidées : elles se retéléchargent au clic.${
        gone.count > 0 ? ` Les ${gone.count} dont le mail a disparu du serveur sont gardées.` : ''
      }`,
      options: this.options((days) => this.attachmentCandidates(days)),
    };

    return [
      {
        id: 'thumbnail_history',
        group: 'images',
        label: 'Historique des miniatures générées',
        description: 'Chaque génération d’image est gardée ici, enregistrée ou non.',
        count: thumbs.count - saved.count,
        bytes: thumbs.bytes - saved.bytes,
        purge: unsaved.count > 0 ? thumbnailPurge : null,
      },
      {
        id: 'thumbnail_saved',
        group: 'images',
        label: 'Miniatures enregistrées',
        description: 'Gardées sur leur vidéo. Se retirent depuis l’onglet Miniatures de la fiche.',
        count: saved.count,
        bytes: saved.bytes,
        purge: null,
      },
      {
        id: 'thumbnail_assets',
        group: 'images',
        label: 'Banque d’images',
        description: 'Tes photos pour les miniatures. Se gèrent dans Paramètres → Miniatures.',
        count: assets.count,
        bytes: assets.bytes,
        purge: null,
      },
      {
        id: 'workspace_images',
        group: 'images',
        label: 'Têtes et produits des vidéos',
        description: 'Les deux images envoyées d’office à la génération, par vidéo.',
        count: workspace.count,
        bytes: workspace.bytes,
        purge: null,
      },
      {
        id: 'draft_covers',
        group: 'images',
        label: 'Couvertures des verticaux',
        description: 'Miniature YouTube et couverture Instagram des shorts.',
        count: covers.count,
        bytes: covers.bytes,
        purge: null,
      },
      {
        id: 'branding_icons',
        group: 'images',
        label: 'Logo et icônes de l’application',
        description: 'Les cinq PNG générés depuis ton logo.',
        count: icons.count,
        bytes: icons.bytes,
        purge: null,
      },
      {
        id: 'mail_attachments',
        group: 'mails',
        label: 'Pièces jointes téléchargées',
        description: 'Le contenu des pièces jointes déjà ouvertes, gardé en base.',
        count: cached.count,
        bytes: cached.bytes,
        purge: this.attachmentCandidates(0).count > 0 ? attachmentPurge : null,
      },
      {
        id: 'mail_messages',
        group: 'mails',
        label: 'Messages relevés',
        description: 'Corps texte et HTML des mails de la boîte suivie.',
        count: messages.count,
        bytes: messages.bytes,
        purge: null,
      },
      {
        id: 'published_videos',
        group: 'videos',
        label: 'Vidéos des verticaux publiés',
        description: 'Les fichiers déposés pour les mises en ligne sont gardés sur le disque.',
        count: files.length,
        bytes: files.reduce((sum, file) => sum + file.bytes, 0),
        purge:
          finished.length > 0
            ? {
                kind: 'published_videos',
                label: 'Supprimer les fichiers',
                keeps:
                  'Seules les vidéos dont toutes les plateformes sont parties sont supprimées. Les liens et l’état « en ligne » restent ; l’aperçu et « Réessayer » ne marcheront plus pour ces shorts.',
                options: this.single(
                  finished.length,
                  finished.reduce((sum, file) => sum + file.bytes, 0),
                ),
              }
            : null,
      },
      {
        id: 'orphan_files',
        group: 'videos',
        label: 'Fichiers orphelins',
        description: 'Des vidéos sur le disque que plus aucune publication ne porte.',
        count: orphans.length,
        bytes: orphans.reduce((sum, file) => sum + file.bytes, 0),
        purge:
          orphans.length > 0
            ? {
                kind: 'orphan_files',
                label: 'Supprimer',
                keeps: 'Aucune publication ne les référence : rien n’en dépend.',
                options: this.single(
                  orphans.length,
                  orphans.reduce((sum, file) => sum + file.bytes, 0),
                ),
              }
            : null,
      },
    ];
  }

  purge(kind: StoragePurgeKind, olderThanDays: number): { deleted: number; freedBytes: number } {
    if (kind === 'thumbnail_history') {
      const { count, bytes } = this.thumbnailCandidates(olderThanDays);
      this.db
        .prepare(
          `DELETE FROM thumbnails WHERE saved_at IS NULL AND created_at <= ? AND ${NOT_IN_AB_TEST}`,
        )
        .run(cutoff(olderThanDays));
      return { deleted: count, freedBytes: bytes };
    }
    if (kind === 'mail_attachments') {
      const { count, bytes } = this.attachmentCandidates(olderThanDays);
      this.db
        .prepare(
          `UPDATE mail_attachments SET data = NULL
            WHERE data IS NOT NULL AND created_at <= ?
              AND message_id IN (SELECT id FROM mail_messages WHERE removed_at IS NULL)`,
        )
        .run(cutoff(olderThanDays));
      return { deleted: count, freedBytes: bytes };
    }
    const targets = kind === 'published_videos' ? this.finishedVideos() : this.orphanFiles();
    for (const target of targets) rmSync(target.path, { force: true });
    return {
      deleted: targets.length,
      freedBytes: targets.reduce((sum, target) => sum + target.bytes, 0),
    };
  }

  compact(): void {
    this.db.exec('VACUUM');
    this.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  }
}
