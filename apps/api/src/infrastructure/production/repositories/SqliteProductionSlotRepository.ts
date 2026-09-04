import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateProductionSlotInput,
  ProductionSlot,
  ProductionSlotView,
  UpdateProductionSlotInput,
} from '../../../domain/production/entities/ProductionSlot.ts';
import type {
  ProductionSlotFilter,
  ProductionSlotRepository,
} from '../../../domain/production/repositories/ProductionRepository.ts';
import { placeholders } from '../../db/filters.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface SlotRow {
  id: string;
  production_id: string;
  step_id: string | null;
  date: string;
  start_time: string | null;
  end_time: string | null;
  label: string;
  done: number;
  notes: string | null;
  origin: string;
  item_id: string | null;
  calendar_uid: string | null;
  time_entry_id: string | null;
  created_at: string;
  updated_at: string;
}

interface SlotViewRow extends SlotRow {
  production_title: string;
  channel_id: string | null;
  channel_color: string | null;
  step_name: string | null;
  step_color: string | null;
}

const toDomain = (row: SlotRow): ProductionSlot => ({
  id: row.id,
  productionId: row.production_id,
  stepId: row.step_id,
  date: row.date,
  startTime: row.start_time,
  endTime: row.end_time,
  label: row.label,
  done: row.done === 1,
  notes: row.notes,
  origin: row.origin === 'planner' ? 'planner' : 'manual',
  itemId: row.item_id,
  calendarUid: row.calendar_uid,
  timeEntryId: row.time_entry_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqliteProductionSlotRepository implements ProductionSlotRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(filter: ProductionSlotFilter = {}): ProductionSlotView[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const productionIds = filter.productionIds ?? [];
    if (productionIds.length > 0) {
      conditions.push(`s.production_id IN (${placeholders(productionIds.length)})`);
      params.push(...productionIds);
    }
    if (filter.range) {
      conditions.push('s.date BETWEEN ? AND ?');
      params.push(filter.range.from, filter.range.to);
    }
    if (filter.includeDone === false) conditions.push('s.done = 0');
    if (filter.origins && filter.origins.length > 0) {
      conditions.push(`s.origin IN (${placeholders(filter.origins.length)})`);
      params.push(...filter.origins);
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.db
      .prepare(
        `SELECT s.*,
                p.title    AS production_title,
                p.channel_id AS channel_id,
                ch.color   AS channel_color,
                st.name    AS step_name,
                st.color   AS step_color
           FROM production_slots s
           JOIN productions p ON p.id = s.production_id
           LEFT JOIN channels ch ON ch.id = p.channel_id
           LEFT JOIN production_steps st ON st.id = s.step_id
           ${clause}
          ORDER BY s.date, s.start_time IS NULL, s.start_time`,
      )
      .all(...(params as never[])) as unknown as SlotViewRow[];

    return rows.map((row) => ({
      ...toDomain(row),
      productionTitle: row.production_title,
      channelId: row.channel_id,
      channelColor: row.channel_color,
      stepName: row.step_name,
      stepColor: row.step_color,
    }));
  }

  findById(id: string): ProductionSlot | null {
    const row = this.db.prepare('SELECT * FROM production_slots WHERE id = ?').get(id) as
      SlotRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateProductionSlotInput): ProductionSlot {
    const id = newId();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO production_slots
           (id, production_id, step_id, date, start_time, end_time, label, done, notes,
            origin, item_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.productionId,
        input.stepId ?? null,
        input.date,
        input.startTime ?? null,
        input.endTime ?? null,
        input.label ?? '',
        input.done ? 1 : 0,
        input.notes ?? null,
        input.origin ?? 'manual',
        input.itemId ?? null,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateProductionSlotInput): ProductionSlot {
    const existing = this.findById(id);
    if (!existing) throw notFound('Créneau');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.stepId !== undefined) set('step_id', input.stepId);
    if (input.date !== undefined) set('date', input.date);
    if (input.startTime !== undefined) set('start_time', input.startTime);
    if (input.endTime !== undefined) set('end_time', input.endTime);
    if (input.label !== undefined) set('label', input.label);
    if (input.done !== undefined) set('done', input.done ? 1 : 0);
    if (input.notes !== undefined) set('notes', input.notes);
    if (input.origin !== undefined) set('origin', input.origin);
    if (input.itemId !== undefined) set('item_id', input.itemId);
    if (input.calendarUid !== undefined) set('calendar_uid', input.calendarUid);
    if (input.timeEntryId !== undefined) set('time_entry_id', input.timeEntryId);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE production_slots SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM production_slots WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Créneau');
  }

  /**
   * Efface les créneaux **déplaçables** d'une fenêtre : ceux que le moteur a posés et
   * qui ne sont pas encore approuvés.
   *
   * C'est le préalable de tout replan. Le filtre `origin = 'planner' AND done = 0` est
   * la règle de déplacement du planning, écrite une fois ici : un créneau posé à la main
   * a été voulu là où il est, et un créneau approuvé raconte du temps déjà passé.
   *
   * `from` à `null` remonte **jusqu'au début** : un replan complet balaie aussi les
   * suggestions passées qu'on n'a jamais approuvées. Elles n'ont rien raconté — les
   * laisser traîner ferait croire que ce travail-là est déjà casé, et le moteur n'en
   * reposerait jamais.
   */
  clearSuggestions(from: string | null, to: string): number {
    const result = from
      ? this.db
          .prepare(
            `DELETE FROM production_slots
              WHERE origin = 'planner' AND done = 0 AND date BETWEEN ? AND ?`,
          )
          .run(from, to)
      : this.db
          .prepare(
            `DELETE FROM production_slots
              WHERE origin = 'planner' AND done = 0 AND date <= ?`,
          )
          .run(to);
    return Number(result.changes ?? 0);
  }
}
