import type { DatabaseSync } from 'node:sqlite';
import type { TodoPlacement } from '../../../domain/todoApp/entities/TodoTask.ts';
import type { TodoPlacementRepository } from '../../../domain/todoApp/repositories/TodoRepository.ts';
import type { IsoDate } from '../../../shared/dates.ts';

interface Row {
  task_id: string;
  date: string;
  start_time: string;
  minutes: number;
}

const toDomain = (row: Row): TodoPlacement => ({
  taskId: row.task_id,
  date: row.date,
  startTime: row.start_time,
  minutes: row.minutes,
});

/** L'heure donnée aux tâches Todo. Une ligne par tâche placée, aucune pour les autres. */
export class SqliteTodoPlacementRepository implements TodoPlacementRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findInRange(from: IsoDate, to: IsoDate): TodoPlacement[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM todo_placements WHERE date >= ? AND date <= ? ORDER BY date, start_time',
      )
      .all(from, to) as unknown as Row[];
    return rows.map(toDomain);
  }

  upsert(placement: TodoPlacement): TodoPlacement {
    this.db
      .prepare(
        `INSERT INTO todo_placements (task_id, date, start_time, minutes, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (task_id) DO UPDATE SET
           date = excluded.date,
           start_time = excluded.start_time,
           minutes = excluded.minutes,
           updated_at = excluded.updated_at`,
      )
      .run(
        placement.taskId,
        placement.date,
        placement.startTime,
        placement.minutes,
        new Date().toISOString(),
      );
    return placement;
  }

  delete(taskId: string): void {
    this.db.prepare('DELETE FROM todo_placements WHERE task_id = ?').run(taskId);
  }

  deleteMany(taskIds: string[]): void {
    if (taskIds.length === 0) return;
    this.db
      .prepare(
        `DELETE FROM todo_placements WHERE task_id IN (${taskIds.map(() => '?').join(', ')})`,
      )
      .run(...taskIds);
  }
}
