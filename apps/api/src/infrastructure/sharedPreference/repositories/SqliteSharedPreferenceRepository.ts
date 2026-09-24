import type { DatabaseSync } from 'node:sqlite';
import type { SharedPreferenceRepository } from '../../../domain/sharedPreference/repositories/SharedPreferenceRepository.ts';

interface PreferenceRow {
  key: string;
  value: string;
}

/** CRUD nu, sans use case : une préférence d'affichage n'a aucun effet de bord. */
export class SqliteSharedPreferenceRepository implements SharedPreferenceRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(): Record<string, unknown> {
    const rows = this.db
      .prepare('SELECT key, value FROM app_preferences')
      .all() as unknown as PreferenceRow[];
    const result: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value);
      } catch {
        // Une valeur illisible est ignorée : le front retombe sur son défaut.
      }
    }
    return result;
  }

  set(key: string, value: unknown): void {
    this.db
      .prepare(
        `INSERT INTO app_preferences (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .run(key, JSON.stringify(value), new Date().toISOString());
  }
}
