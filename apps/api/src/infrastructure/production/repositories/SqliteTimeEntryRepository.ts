import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateTimeEntryInput,
  TimeEntry,
  TimeEntryView,
  UpdateTimeEntryInput,
} from '../../../domain/production/entities/TimeEntry.ts';
import { placeholders } from '../../db/filters.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface TimeRow {
  id: string;
  production_id: string;
  step_id: string | null;
  todo_id: string | null;
  started_at: string;
  ended_at: string | null;
  minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface TimeViewRow extends TimeRow {
  production_title: string;
  channel_id: string | null;
  channel_color: string | null;
  step_name: string | null;
  step_color: string | null;
  todo_label: string | null;
  slot_id: string | null;
}

const toDomain = (row: TimeRow): TimeEntry => ({
  id: row.id,
  productionId: row.production_id,
  stepId: row.step_id,
  todoId: row.todo_id,
  startedAt: row.started_at,
  endedAt: row.ended_at,
  minutes: row.minutes,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toView = (row: TimeViewRow): TimeEntryView => ({
  ...toDomain(row),
  productionTitle: row.production_title,
  channelId: row.channel_id,
  channelColor: row.channel_color,
  stepName: row.step_name,
  stepColor: row.step_color,
  todoLabel: row.todo_label,
  slotId: row.slot_id,
  // Le jour de rattachement est celui du DÉBUT : une session commencée à 23 h 40 et
  // terminée à 0 h 20 appartient à la soirée où on s'y est mis, pas au lendemain.
  date: row.started_at.slice(0, 10),
});

const VIEW_SQL = `
  SELECT t.*,
         p.title    AS production_title,
         p.channel_id AS channel_id,
         ch.color   AS channel_color,
         s.name     AS step_name,
         s.color    AS step_color,
         -- Le libelle vient de l'une OU l'autre des deux tables de taches : todo_id
         -- n'a pas de cle etrangere, comme les coches et la pile du planning.
         COALESCE(
           (SELECT label FROM step_todos WHERE id = t.todo_id),
           (SELECT label FROM production_todos WHERE id = t.todo_id)
         ) AS todo_label,
         (SELECT id FROM production_slots WHERE time_entry_id = t.id LIMIT 1) AS slot_id
    FROM production_time_entries t
    JOIN productions p ON p.id = t.production_id
    LEFT JOIN channels ch ON ch.id = p.channel_id
    LEFT JOIN production_steps s ON s.id = t.step_id
`;

export interface TimeEntryFilter {
  productionIds?: string[];
  /** Bornes sur le jour de début. */
  from?: string;
  to?: string;
}

/**
 * Les sessions de travail.
 *
 * Le chronomètre en cours est une **ligne sans `ended_at`**, pas un état de navigateur :
 * recharger la page, changer de machine ou fermer l'onglet ne perd rien.
 */
export class SqliteTimeEntryRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(filter: TimeEntryFilter = {}): TimeEntryView[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const ids = filter.productionIds ?? [];
    if (ids.length > 0) {
      conditions.push(`t.production_id IN (${placeholders(ids.length)})`);
      params.push(...ids);
    }
    if (filter.from) {
      conditions.push('substr(t.started_at, 1, 10) >= ?');
      params.push(filter.from);
    }
    if (filter.to) {
      conditions.push('substr(t.started_at, 1, 10) <= ?');
      params.push(filter.to);
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`${VIEW_SQL} ${clause} ORDER BY t.started_at DESC`)
      .all(...(params as never[])) as unknown as TimeViewRow[];

    return rows.map(toView);
  }

  findById(id: string): TimeEntry | null {
    const row = this.db.prepare('SELECT * FROM production_time_entries WHERE id = ?').get(id) as
      TimeRow | undefined;
    return row ? toDomain(row) : null;
  }

  /** La même session, enrichie : le planning a besoin du titre pour nommer le créneau. */
  findViewById(id: string): TimeEntryView | null {
    const row = this.db.prepare(`${VIEW_SQL} WHERE t.id = ?`).get(id) as TimeViewRow | undefined;
    return row ? toView(row) : null;
  }

  /** La session en cours, s'il y en a une. La plus récemment démarrée fait foi. */
  findRunning(): TimeEntryView | null {
    const row = this.db
      .prepare(`${VIEW_SQL} WHERE t.ended_at IS NULL ORDER BY t.started_at DESC LIMIT 1`)
      .get() as TimeViewRow | undefined;
    return row ? toView(row) : null;
  }

  create(input: CreateTimeEntryInput): TimeEntry {
    const id = newId();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO production_time_entries
           (id, production_id, step_id, todo_id, started_at, ended_at, minutes, notes,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.productionId,
        input.stepId ?? null,
        input.todoId ?? null,
        input.startedAt,
        input.endedAt ?? null,
        input.minutes ?? null,
        input.notes ?? null,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateTimeEntryInput): TimeEntry {
    const existing = this.findById(id);
    if (!existing) throw notFound('Session de travail');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.stepId !== undefined) set('step_id', input.stepId);
    if (input.todoId !== undefined) set('todo_id', input.todoId);
    if (input.startedAt !== undefined) set('started_at', input.startedAt);
    if (input.endedAt !== undefined) set('ended_at', input.endedAt);
    if (input.minutes !== undefined) set('minutes', input.minutes);
    if (input.notes !== undefined) set('notes', input.notes);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE production_time_entries SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM production_time_entries WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Session de travail');
  }

  /** Minutes déjà closes par production, pour les compteurs des cartes de la file. */
  sumByProduction(productionIds: string[]): Map<string, number> {
    const totals = new Map<string, number>();
    if (productionIds.length === 0) return totals;

    const rows = this.db
      .prepare(
        `SELECT production_id, COALESCE(SUM(minutes), 0) AS total
           FROM production_time_entries
          WHERE production_id IN (${placeholders(productionIds.length)})
          GROUP BY production_id`,
      )
      .all(...(productionIds as never[])) as unknown as Array<{
      production_id: string;
      total: number;
    }>;

    for (const row of rows) totals.set(row.production_id, row.total);
    return totals;
  }
}
