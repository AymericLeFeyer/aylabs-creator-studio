import type { DatabaseSync } from 'node:sqlite';
import type { StoredAiSettings } from '../../../domain/ai/entities/Ai.ts';
import type { AiSettingsRepository } from '../../../domain/ai/repositories/AiRepository.ts';

const ROW_ID = 'default';

/** La ligne unique des réglages de l'IA. La clé n'y est rangée que **chiffrée**. */
export class SqliteAiSettingsRepository implements AiSettingsRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  get(): StoredAiSettings {
    const now = new Date().toISOString();
    // La migration insère la ligne ; ce filet ne sert qu'à une base recopiée.
    this.db
      .prepare('INSERT OR IGNORE INTO ai_settings (id, created_at, updated_at) VALUES (?, ?, ?)')
      .run(ROW_ID, now, now);
    const row = this.db
      .prepare('SELECT api_key, model FROM ai_settings WHERE id = ?')
      .get(ROW_ID) as { api_key: string | null; model: string | null };
    return { encryptedApiKey: row.api_key, model: row.model };
  }

  update(patch: Partial<StoredAiSettings>): void {
    this.get();
    const now = new Date().toISOString();
    if (patch.encryptedApiKey !== undefined) {
      this.db
        .prepare('UPDATE ai_settings SET api_key = ?, updated_at = ? WHERE id = ?')
        .run(patch.encryptedApiKey, now, ROW_ID);
    }
    if (patch.model !== undefined) {
      this.db
        .prepare('UPDATE ai_settings SET model = ?, updated_at = ? WHERE id = ?')
        .run(patch.model, now, ROW_ID);
    }
  }
}
