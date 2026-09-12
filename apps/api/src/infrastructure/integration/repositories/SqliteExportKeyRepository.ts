import type { DatabaseSync } from 'node:sqlite';
import type { ExportKey } from '../../../domain/integration/entities/Integration.ts';
import type { ExportKeyRepository } from '../../../domain/integration/repositories/IntegrationRepository.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface Row {
  id: string;
  label: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

const toDomain = (row: Row): ExportKey => ({
  id: row.id,
  label: row.label,
  prefix: row.prefix,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
});

/** Les clés d'accès à l'export. Seule l'empreinte du jeton est stockée. */
export class SqliteExportKeyRepository implements ExportKeyRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(): ExportKey[] {
    const rows = this.db
      .prepare(
        'SELECT id, label, prefix, created_at, last_used_at FROM export_keys ORDER BY created_at',
      )
      .all() as unknown as Row[];
    return rows.map(toDomain);
  }

  create(label: string, tokenHash: string, prefix: string): ExportKey {
    const id = newId();
    this.db
      .prepare(
        'INSERT INTO export_keys (id, label, token_hash, prefix, created_at) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, label, tokenHash, prefix, new Date().toISOString());
    return this.findAll().find((key) => key.id === id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM export_keys WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Clé d’accès');
  }

  touch(tokenHash: string): boolean {
    const result = this.db
      .prepare('UPDATE export_keys SET last_used_at = ? WHERE token_hash = ?')
      .run(new Date().toISOString(), tokenHash);
    return result.changes > 0;
  }

  count(): number {
    const row = this.db.prepare('SELECT COUNT(*) AS n FROM export_keys').get() as { n: number };
    return row.n;
  }
}
