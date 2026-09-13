import type { DatabaseSync } from 'node:sqlite';
import type {
  StoredTodoConnection,
  TodoConnectionRepository,
} from '../../../domain/todoApp/repositories/TodoRepository.ts';

interface Row {
  todo_base_url: string | null;
  todo_api_key: string | null;
  todo_tags: string;
}

const ROW_ID = 'default';

/**
 * La connexion à Todo, rangée sur la ligne unique de `planning_settings`.
 *
 * Le dépôt ne range que du **chiffré** : c'est `ManageTodoTasks` qui chiffre et
 * déchiffre, exactement comme `ManageIntegrations` pour les secrets de l'export.
 */
export class SqliteTodoConnectionRepository implements TodoConnectionRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  get(): StoredTodoConnection {
    const row = this.db
      .prepare('SELECT todo_base_url, todo_api_key, todo_tags FROM planning_settings WHERE id = ?')
      .get(ROW_ID) as unknown as Row | undefined;
    if (!row) return { baseUrl: null, encryptedKey: null, tags: [] };
    return {
      baseUrl: row.todo_base_url,
      encryptedKey: row.todo_api_key,
      tags: row.todo_tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
    };
  }

  update(patch: Partial<StoredTodoConnection>): void {
    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (patch.baseUrl !== undefined) set('todo_base_url', patch.baseUrl);
    if (patch.encryptedKey !== undefined) set('todo_api_key', patch.encryptedKey);
    if (patch.tags !== undefined) set('todo_tags', patch.tags.join(','));
    if (fields.length === 0) return;

    const now = new Date().toISOString();
    // La migration du planning insère la ligne ; ce filet ne sert qu'à une base recopiée.
    this.db
      .prepare(
        'INSERT OR IGNORE INTO planning_settings (id, created_at, updated_at) VALUES (?, ?, ?)',
      )
      .run(ROW_ID, now, now);

    set('updated_at', now);
    values.push(ROW_ID);
    this.db
      .prepare(`UPDATE planning_settings SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));
  }
}
