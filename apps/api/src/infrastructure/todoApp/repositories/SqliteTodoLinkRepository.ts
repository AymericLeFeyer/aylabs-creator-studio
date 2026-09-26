import type { DatabaseSync } from 'node:sqlite';
import type {
  TodoLink,
  TodoLinkRepository,
} from '../../../domain/todoApp/repositories/TodoRepository.ts';

interface LinkRow {
  key: string;
  task_id: string;
  done: number;
}

const toDomain = (row: LinkRow): TodoLink => ({
  key: row.key,
  taskId: row.task_id,
  done: row.done === 1,
});

/** Les tâches posées dans Todo par le studio. Aucune suppression : voir le port. */
export class SqliteTodoLinkRepository implements TodoLinkRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  find(key: string): TodoLink | null {
    const row = this.db.prepare('SELECT * FROM todo_links WHERE key = ?').get(key) as
      LinkRow | undefined;
    return row ? toDomain(row) : null;
  }

  findByPrefix(prefix: string): TodoLink[] {
    // Comparaison de sous-chaîne plutôt qu'un LIKE : aucun caractère à échapper.
    const rows = this.db
      .prepare('SELECT * FROM todo_links WHERE substr(key, 1, length(?)) = ?')
      .all(prefix, prefix) as unknown as LinkRow[];
    return rows.map(toDomain);
  }

  save(link: TodoLink): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO todo_links (key, task_id, done, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET task_id = excluded.task_id, done = excluded.done,
                                        updated_at = excluded.updated_at`,
      )
      .run(link.key, link.taskId, link.done ? 1 : 0, now, now);
  }
}
