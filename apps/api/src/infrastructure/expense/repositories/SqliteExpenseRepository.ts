import type { DatabaseSync } from 'node:sqlite';
import type { IsoDate } from '../../../shared/dates.ts';
import type {
  CreateExpenseEntryInput,
  ExpenseEntry,
  ExpenseEntryView,
  UpdateExpenseEntryInput,
} from '../../../domain/expense/entities/ExpenseEntry.ts';
import type {
  ExpenseEntryFilter,
  ExpenseRepository,
} from '../../../domain/expense/repositories/ExpenseRepository.ts';
import { buildEntryWhere } from '../../db/filters.ts';
import { newId } from '../../../shared/id.ts';
import { conflict, notFound } from '../../../shared/errors.ts';

interface ExpenseRow {
  id: string;
  channel_id: string | null;
  category_id: string;
  date: string;
  amount_cents: number;
  label: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ExpenseViewRow extends ExpenseRow {
  category_name: string;
  category_color: string;
  channel_name: string | null;
}

const toDomain = (row: ExpenseRow): ExpenseEntry => ({
  id: row.id,
  channelId: row.channel_id,
  categoryId: row.category_id,
  date: row.date,
  amountCents: row.amount_cents,
  label: row.label,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Refuse une dépense dans une catégorie réservée aux revenus.
 * Le contrôle vit ici, au plus près de l'écriture : toutes les routes y passent.
 */
const assertAcceptsExpense = (db: DatabaseSync, categoryId: string): void => {
  const row = db.prepare('SELECT scope, name FROM categories WHERE id = ?').get(categoryId) as
    { scope: string; name: string } | undefined;
  if (!row) throw notFound('Catégorie');
  if (row.scope === 'revenue') {
    throw conflict(`« ${row.name} » est une catégorie de revenus : elle n'accepte pas de dépense.`);
  }
};

export class SqliteExpenseRepository implements ExpenseRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(filter: ExpenseEntryFilter = {}): ExpenseEntryView[] {
    const { clause, params } = buildEntryWhere(filter, 'e');
    const categoryIds = filter.categoryIds ?? [];
    const allParams = [...params];

    let sql = `
      SELECT e.*,
             c.name  AS category_name,
             c.color AS category_color,
             ch.name AS channel_name
        FROM expense_entries e
        JOIN categories c ON c.id = e.category_id
        LEFT JOIN channels ch ON ch.id = e.channel_id
        ${clause}`;

    if (categoryIds.length > 0) {
      const inClause = `e.category_id IN (${categoryIds.map(() => '?').join(', ')})`;
      sql += clause ? ` AND ${inClause}` : ` WHERE ${inClause}`;
      allParams.push(...categoryIds);
    }
    sql += ' ORDER BY e.date DESC, e.created_at DESC';

    const rows = this.db.prepare(sql).all(...(allParams as never[])) as unknown as ExpenseViewRow[];

    return rows.map((row) => ({
      ...toDomain(row),
      categoryName: row.category_name,
      categoryColor: row.category_color,
      channelName: row.channel_name,
    }));
  }

  findById(id: string): ExpenseEntry | null {
    const row = this.db.prepare('SELECT * FROM expense_entries WHERE id = ?').get(id) as
      ExpenseRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateExpenseEntryInput): ExpenseEntry {
    assertAcceptsExpense(this.db, input.categoryId);
    const id = newId();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO expense_entries
           (id, channel_id, category_id, date, amount_cents, label, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.channelId ?? null,
        input.categoryId,
        input.date,
        input.amountCents,
        input.label,
        input.notes ?? null,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateExpenseEntryInput): ExpenseEntry {
    const existing = this.findById(id);
    if (!existing) throw notFound('Dépense');
    if (input.categoryId !== undefined) assertAcceptsExpense(this.db, input.categoryId);

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.channelId !== undefined) set('channel_id', input.channelId);
    if (input.categoryId !== undefined) set('category_id', input.categoryId);
    if (input.date !== undefined) set('date', input.date);
    if (input.amountCents !== undefined) set('amount_cents', input.amountCents);
    if (input.label !== undefined) set('label', input.label);
    if (input.notes !== undefined) set('notes', input.notes);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE expense_entries SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM expense_entries WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Dépense');
  }

  sumByDate(
    filter: ExpenseEntryFilter,
  ): Array<{ date: IsoDate; categoryId: string; totalCents: number }> {
    const { clause, params } = buildEntryWhere(filter, 'e');
    const rows = this.db
      .prepare(
        `SELECT e.date AS date, e.category_id AS category_id, SUM(e.amount_cents) AS total
           FROM expense_entries e
           ${clause}
          GROUP BY e.date, e.category_id
          ORDER BY e.date`,
      )
      .all(...(params as never[])) as unknown as Array<{
      date: string;
      category_id: string;
      total: number;
    }>;

    return rows.map((r) => ({ date: r.date, categoryId: r.category_id, totalCents: r.total }));
  }

  sumByCategory(filter: ExpenseEntryFilter): Array<{ categoryId: string; totalCents: number }> {
    const { clause, params } = buildEntryWhere(filter, 'e');
    const rows = this.db
      .prepare(
        `SELECT e.category_id AS category_id, SUM(e.amount_cents) AS total
           FROM expense_entries e
           ${clause}
          GROUP BY e.category_id`,
      )
      .all(...(params as never[])) as unknown as Array<{ category_id: string; total: number }>;

    return rows.map((r) => ({ categoryId: r.category_id, totalCents: r.total }));
  }
}
