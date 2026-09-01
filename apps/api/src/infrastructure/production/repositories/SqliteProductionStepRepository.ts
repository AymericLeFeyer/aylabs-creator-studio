import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateProductionStepInput,
  ProductionStep,
  UpdateProductionStepInput,
} from '../../../domain/production/entities/ProductionStep.ts';
import type { ProductionStepRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface StepRow {
  id: string;
  name: string;
  color: string;
  sort_order: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: StepRow): ProductionStep => ({
  id: row.id,
  name: row.name,
  color: row.color,
  sortOrder: row.sort_order,
  isArchived: row.is_archived === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqliteProductionStepRepository implements ProductionStepRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(includeArchived = false): ProductionStep[] {
    const clause = includeArchived ? '' : 'WHERE is_archived = 0';
    const rows = this.db
      .prepare(`SELECT * FROM production_steps ${clause} ORDER BY sort_order, name`)
      .all() as unknown as StepRow[];
    return rows.map(toDomain);
  }

  findById(id: string): ProductionStep | null {
    const row = this.db.prepare('SELECT * FROM production_steps WHERE id = ?').get(id) as
      StepRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateProductionStepInput): ProductionStep {
    const id = newId();
    const now = new Date().toISOString();
    const nextOrder =
      input.sortOrder ??
      (
        this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM production_steps').get() as {
          n: number;
        }
      ).n + 1;

    this.db
      .prepare(
        `INSERT INTO production_steps
           (id, name, color, sort_order, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(id, input.name, input.color ?? '#64748b', nextOrder, now, now);

    return this.findById(id)!;
  }

  update(id: string, input: UpdateProductionStepInput): ProductionStep {
    const existing = this.findById(id);
    if (!existing) throw notFound('Étape');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.name !== undefined) set('name', input.name);
    if (input.color !== undefined) set('color', input.color);
    if (input.sortOrder !== undefined) set('sort_order', input.sortOrder);
    if (input.isArchived !== undefined) set('is_archived', input.isArchived ? 1 : 0);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE production_steps SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  /**
   * Supprime l'étape. Les cases cochées partent en cascade (contrainte SQL) et les
   * créneaux qui la visaient sont détachés : perdre une étape ne doit pas effacer le
   * créneau qu'on avait posé pour elle.
   */
  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM production_steps WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Étape');
  }
}
