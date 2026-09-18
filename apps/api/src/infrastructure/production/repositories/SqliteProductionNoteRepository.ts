import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateProductionNoteInput,
  ProductionNote,
  UpdateProductionNoteInput,
} from '../../../domain/production/entities/ProductionNote.ts';
import type { ProductionNoteRepository } from '../../../domain/production/repositories/ProductionNoteRepository.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface ProductionNoteRow {
  id: string;
  production_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: ProductionNoteRow): ProductionNote => ({
  id: row.id,
  productionId: row.production_id,
  title: row.title,
  content: row.content,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqliteProductionNoteRepository implements ProductionNoteRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findByProduction(productionId: string): ProductionNote[] {
    this.assertProduction(productionId);
    const rows = this.db
      .prepare(
        `SELECT * FROM production_notes WHERE production_id = ?
          ORDER BY created_at, rowid`,
      )
      .all(productionId) as unknown as ProductionNoteRow[];
    return rows.map(toDomain);
  }

  create(productionId: string, input: CreateProductionNoteInput): ProductionNote {
    this.assertProduction(productionId);
    const id = newId();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO production_notes (id, production_id, title, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, productionId, input.title ?? '', input.content ?? '', now, now);
    return this.findOne(productionId, id)!;
  }

  update(productionId: string, id: string, input: UpdateProductionNoteInput): ProductionNote {
    const existing = this.findOne(productionId, id);
    if (!existing) throw notFound('Note');
    if (input.title === undefined && input.content === undefined) return existing;

    this.db
      .prepare('UPDATE production_notes SET title = ?, content = ?, updated_at = ? WHERE id = ?')
      .run(
        input.title ?? existing.title,
        input.content ?? existing.content,
        new Date().toISOString(),
        id,
      );
    return this.findOne(productionId, id)!;
  }

  delete(productionId: string, id: string): void {
    const result = this.db
      .prepare('DELETE FROM production_notes WHERE id = ? AND production_id = ?')
      .run(id, productionId);
    if (result.changes === 0) throw notFound('Note');
  }

  private findOne(productionId: string, id: string): ProductionNote | null {
    const row = this.db
      .prepare('SELECT * FROM production_notes WHERE id = ? AND production_id = ?')
      .get(id, productionId) as ProductionNoteRow | undefined;
    return row ? toDomain(row) : null;
  }

  private assertProduction(productionId: string): void {
    const row = this.db.prepare('SELECT 1 FROM productions WHERE id = ?').get(productionId);
    if (!row) throw notFound('Production');
  }
}
