import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateRecurringExpenseInput,
  RecurrenceFrequency,
  RecurringExpense,
  RecurringExpenseView,
  UpdateRecurringExpenseInput,
} from '../../../domain/expense/entities/RecurringExpense.ts';
import { nextOccurrences, yearlyCost } from '../../../domain/expense/entities/RecurringExpense.ts';
import type { RecurringExpenseRepository } from '../../../domain/expense/repositories/RecurringExpenseRepository.ts';
import { today } from '../../../shared/dates.ts';
import { newId } from '../../../shared/id.ts';
import { conflict, notFound } from '../../../shared/errors.ts';

interface RecurringRow {
  id: string;
  channel_id: string | null;
  category_id: string;
  label: string;
  amount_cents: number;
  frequency: string;
  day_of_month: number;
  month_of_year: number | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

interface RecurringViewRow extends RecurringRow {
  category_name: string;
  category_color: string;
  channel_name: string | null;
  occurrences_count: number;
}

const toDomain = (row: RecurringRow): RecurringExpense => ({
  id: row.id,
  channelId: row.channel_id,
  categoryId: row.category_id,
  label: row.label,
  amountCents: row.amount_cents,
  frequency: row.frequency as RecurrenceFrequency,
  dayOfMonth: row.day_of_month,
  monthOfYear: row.month_of_year,
  startDate: row.start_date,
  endDate: row.end_date,
  notes: row.notes,
  isActive: row.is_active === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Une règle récurrente doit désigner une catégorie qui accepte les dépenses : la garde
 * est la même que pour une saisie manuelle, sinon la projection créerait douze lignes
 * refusées une à une.
 */
const assertAcceptsExpense = (db: DatabaseSync, categoryId: string): void => {
  const row = db.prepare('SELECT scope, name FROM categories WHERE id = ?').get(categoryId) as
    { scope: string; name: string } | undefined;
  if (!row) throw notFound('Catégorie');
  if (row.scope === 'revenue') {
    throw conflict(`« ${row.name} » est une catégorie de revenus : elle n'accepte pas de dépense.`);
  }
};

export class SqliteRecurringExpenseRepository implements RecurringExpenseRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(includeInactive = true): RecurringExpenseView[] {
    const clause = includeInactive ? '' : 'WHERE r.is_active = 1';
    const rows = this.db
      .prepare(
        `SELECT r.*,
                c.name  AS category_name,
                c.color AS category_color,
                ch.name AS channel_name,
                (SELECT COUNT(*) FROM expense_entries e WHERE e.recurring_id = r.id)
                  AS occurrences_count
           FROM recurring_expenses r
           JOIN categories c ON c.id = r.category_id
           LEFT JOIN channels ch ON ch.id = r.channel_id
           ${clause}
          ORDER BY r.is_active DESC, r.label COLLATE NOCASE`,
      )
      .all() as unknown as RecurringViewRow[];

    const now = today();
    return rows.map((row) => {
      const rule = toDomain(row);
      return {
        ...rule,
        categoryName: row.category_name,
        categoryColor: row.category_color,
        channelName: row.channel_name,
        nextDate: nextOccurrences(rule, now, 1)[0] ?? null,
        occurrencesCount: row.occurrences_count,
        yearlyCents: yearlyCost(rule),
      };
    });
  }

  findById(id: string): RecurringExpense | null {
    const row = this.db.prepare('SELECT * FROM recurring_expenses WHERE id = ?').get(id) as
      RecurringRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateRecurringExpenseInput): RecurringExpense {
    assertAcceptsExpense(this.db, input.categoryId);
    const id = newId();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO recurring_expenses
           (id, channel_id, category_id, label, amount_cents, frequency, day_of_month,
            month_of_year, start_date, end_date, notes, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.channelId ?? null,
        input.categoryId,
        input.label,
        input.amountCents,
        input.frequency,
        // Sans jour précisé, celui de la date de début : c'est presque toujours le bon.
        input.dayOfMonth ?? Number(input.startDate.slice(8, 10)),
        input.monthOfYear ??
          (input.frequency === 'yearly' ? Number(input.startDate.slice(5, 7)) : null),
        input.startDate,
        input.endDate ?? null,
        input.notes ?? null,
        input.isActive === false ? 0 : 1,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateRecurringExpenseInput): RecurringExpense {
    const existing = this.findById(id);
    if (!existing) throw notFound('Dépense récurrente');
    if (input.categoryId !== undefined) assertAcceptsExpense(this.db, input.categoryId);

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.channelId !== undefined) set('channel_id', input.channelId);
    if (input.categoryId !== undefined) set('category_id', input.categoryId);
    if (input.label !== undefined) set('label', input.label);
    if (input.amountCents !== undefined) set('amount_cents', input.amountCents);
    if (input.frequency !== undefined) set('frequency', input.frequency);
    if (input.dayOfMonth !== undefined) set('day_of_month', input.dayOfMonth);
    if (input.monthOfYear !== undefined) set('month_of_year', input.monthOfYear);
    if (input.startDate !== undefined) set('start_date', input.startDate);
    if (input.endDate !== undefined) set('end_date', input.endDate);
    if (input.notes !== undefined) set('notes', input.notes);
    if (input.isActive !== undefined) set('is_active', input.isActive ? 1 : 0);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE recurring_expenses SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  /**
   * Les occurrences à venir partent avec la règle, les passées sont détachées.
   *
   * Une échéance déjà payée fait partie de la comptabilité : l'effacer changerait le
   * bénéfice d'un mois clos. Une échéance future, elle, n'est qu'une projection — la
   * garder produirait une dépense fantôme que plus aucune règle n'explique.
   */
  deleteOccurrencesFrom(id: string, from: string): void {
    this.db
      .prepare('DELETE FROM expense_entries WHERE recurring_id = ? AND date >= ?')
      .run(id, from);
  }

  delete(id: string, now = today()): void {
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare('DELETE FROM expense_entries WHERE recurring_id = ? AND date > ?')
        .run(id, now);
      const result = this.db.prepare('DELETE FROM recurring_expenses WHERE id = ?').run(id);
      if (result.changes === 0) throw notFound('Dépense récurrente');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
