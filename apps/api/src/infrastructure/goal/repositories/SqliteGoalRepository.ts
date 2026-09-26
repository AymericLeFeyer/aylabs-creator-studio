import type { DatabaseSync } from 'node:sqlite';
import type {
  Goal,
  GoalInput,
  GoalMetricId,
  GoalUpdate,
} from '../../../domain/goal/entities/Goal.ts';
import type { GoalRepository } from '../../../domain/goal/repositories/GoalRepository.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface GoalRow {
  id: string;
  title: string;
  metric: string;
  entity_id: string | null;
  start_date: string;
  end_date: string;
  start_value: number;
  target_value: number;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** En rotation, comme les marques : sur le graphique commun, une courbe par couleur. */
const DEFAULT_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ef4444',
  '#14b8a6',
  '#ec4899',
  '#f97316',
];

const toDomain = (row: GoalRow): Goal => ({
  id: row.id,
  title: row.title,
  metric: row.metric as GoalMetricId,
  entityId: row.entity_id,
  startDate: row.start_date,
  endDate: row.end_date,
  startValue: row.start_value,
  targetValue: row.target_value,
  color: row.color,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** CRUD nu : un objectif n'écrit rien ailleurs, sa progression se lit à la volée. */
export class SqliteGoalRepository implements GoalRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(): Goal[] {
    const rows = this.db
      .prepare('SELECT * FROM goals ORDER BY sort_order, created_at')
      .all() as unknown as GoalRow[];
    return rows.map(toDomain);
  }

  findById(id: string): Goal {
    const row = this.db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as GoalRow | undefined;
    if (!row) throw notFound('Objectif');
    return toDomain(row);
  }

  create(input: GoalInput): Goal {
    const id = newId();
    const now = new Date().toISOString();
    const { next, count } = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next, COUNT(*) AS count FROM goals')
      .get() as { next: number; count: number };
    this.db
      .prepare(
        `INSERT INTO goals
           (id, title, metric, entity_id, start_date, end_date, start_value, target_value,
            color, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.title?.trim() ?? '',
        input.metric,
        input.entityId ?? null,
        input.startDate,
        input.endDate,
        input.startValue,
        input.targetValue,
        input.color ?? DEFAULT_COLORS[count % DEFAULT_COLORS.length]!,
        next,
        now,
        now,
      );
    return this.findById(id);
  }

  update(id: string, input: GoalUpdate): Goal {
    const current = this.findById(id);
    const next = { ...current, ...stripUndefined(input) };
    this.db
      .prepare(
        `UPDATE goals SET title = ?, metric = ?, entity_id = ?, start_date = ?, end_date = ?,
                start_value = ?, target_value = ?, color = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(
        next.title.trim(),
        next.metric,
        next.entityId ?? null,
        next.startDate,
        next.endDate,
        next.startValue,
        next.targetValue,
        next.color,
        new Date().toISOString(),
        id,
      );
    return this.findById(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM goals WHERE id = ?').run(id);
  }

  reorder(ids: string[]): Goal[] {
    const stmt = this.db.prepare('UPDATE goals SET sort_order = ? WHERE id = ?');
    this.db.exec('BEGIN');
    try {
      ids.forEach((id, index) => stmt.run(index + 1, id));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.findAll();
  }
}

const stripUndefined = <T extends object>(input: T): Partial<T> =>
  Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Partial<T>;
