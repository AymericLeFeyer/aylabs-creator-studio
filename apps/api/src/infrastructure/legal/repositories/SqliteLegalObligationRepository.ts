import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateLegalObligationInput,
  LegalCheck,
  LegalObligation,
  UpdateLegalObligationInput,
} from '../../../domain/legal/entities/LegalObligation.ts';
import type { LegalObligationRepository } from '../../../domain/legal/repositories/LegalRepository.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface ObligationRow {
  id: string;
  label: string;
  day_of_month: number | null;
  notes: string | null;
  sort_order: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

interface CheckRow {
  obligation_id: string;
  month: string;
  checked_at: string;
}

const toDomain = (row: ObligationRow): LegalObligation => ({
  id: row.id,
  label: row.label,
  dayOfMonth: row.day_of_month,
  notes: row.notes,
  sortOrder: row.sort_order,
  isArchived: row.is_archived === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqliteLegalObligationRepository implements LegalObligationRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(includeArchived = false): LegalObligation[] {
    const clause = includeArchived ? '' : 'WHERE is_archived = 0';
    const rows = this.db
      .prepare(`SELECT * FROM legal_obligations ${clause} ORDER BY sort_order, label`)
      .all() as unknown as ObligationRow[];
    return rows.map(toDomain);
  }

  findById(id: string): LegalObligation | null {
    const row = this.db.prepare('SELECT * FROM legal_obligations WHERE id = ?').get(id) as
      ObligationRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateLegalObligationInput): LegalObligation {
    const id = newId();
    const now = new Date().toISOString();
    const nextOrder =
      input.sortOrder ??
      (
        this.db
          .prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM legal_obligations')
          .get() as {
          n: number;
        }
      ).n + 1;

    this.db
      .prepare(
        `INSERT INTO legal_obligations
           (id, label, day_of_month, notes, sort_order, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(id, input.label, input.dayOfMonth ?? null, input.notes ?? null, nextOrder, now, now);

    return this.findById(id)!;
  }

  update(id: string, input: UpdateLegalObligationInput): LegalObligation {
    const existing = this.findById(id);
    if (!existing) throw notFound('Obligation');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.label !== undefined) set('label', input.label);
    if (input.dayOfMonth !== undefined) set('day_of_month', input.dayOfMonth);
    if (input.notes !== undefined) set('notes', input.notes);
    if (input.sortOrder !== undefined) set('sort_order', input.sortOrder);
    if (input.isArchived !== undefined) set('is_archived', input.isArchived ? 1 : 0);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE legal_obligations SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM legal_obligations WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Obligation');
  }

  findChecks(month?: string): LegalCheck[] {
    const rows = (month
      ? this.db.prepare('SELECT * FROM legal_checks WHERE month = ?').all(month)
      : this.db.prepare('SELECT * FROM legal_checks').all()) as unknown as CheckRow[];

    return rows.map((row) => ({
      obligationId: row.obligation_id,
      month: row.month,
      checkedAt: row.checked_at,
    }));
  }

  /**
   * `DO NOTHING` et non `DO UPDATE` : recocher une case déjà cochée ne doit pas
   * repousser la date de réalisation — même mécanique que les étapes de production.
   */
  check(obligationId: string, month: string): void {
    if (!this.findById(obligationId)) throw notFound('Obligation');
    this.db
      .prepare(
        `INSERT INTO legal_checks (obligation_id, month, checked_at)
         VALUES (?, ?, ?)
         ON CONFLICT(obligation_id, month) DO NOTHING`,
      )
      .run(obligationId, month, new Date().toISOString());
  }

  uncheck(obligationId: string, month: string): void {
    this.db
      .prepare('DELETE FROM legal_checks WHERE obligation_id = ? AND month = ?')
      .run(obligationId, month);
  }
}
