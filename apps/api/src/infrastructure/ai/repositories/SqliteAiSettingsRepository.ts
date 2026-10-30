import type { DatabaseSync } from 'node:sqlite';
import type { StoredAiSettings } from '../../../domain/ai/entities/Ai.ts';
import type { AiSettingsRepository } from '../../../domain/ai/repositories/AiRepository.ts';

const ROW_ID = 'default';

const COLUMNS: Record<keyof StoredAiSettings, string> = {
  encryptedApiKey: 'api_key',
  model: 'model',
  creditBalanceCents: 'credit_balance_cents',
  creditSetAt: 'credit_set_at',
  creditSpentMicros: 'credit_spent_micros',
  creditExhaustedAt: 'credit_exhausted_at',
};

interface Row {
  api_key: string | null;
  model: string | null;
  credit_balance_cents: number | null;
  credit_set_at: string | null;
  credit_spent_micros: number;
  credit_exhausted_at: string | null;
}

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
      .prepare(
        `SELECT api_key, model, credit_balance_cents, credit_set_at, credit_spent_micros,
                credit_exhausted_at
           FROM ai_settings WHERE id = ?`,
      )
      .get(ROW_ID) as unknown as Row;
    return {
      encryptedApiKey: row.api_key,
      model: row.model,
      creditBalanceCents: row.credit_balance_cents,
      creditSetAt: row.credit_set_at,
      creditSpentMicros: row.credit_spent_micros,
      creditExhaustedAt: row.credit_exhausted_at,
    };
  }

  update(patch: Partial<StoredAiSettings>): void {
    this.get();
    const now = new Date().toISOString();
    for (const key of Object.keys(COLUMNS) as (keyof StoredAiSettings)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      this.db
        .prepare(`UPDATE ai_settings SET ${COLUMNS[key]} = ?, updated_at = ? WHERE id = ?`)
        .run(value, now, ROW_ID);
    }
  }

  addCreditSpend(micros: number): void {
    this.get();
    this.db
      .prepare(
        'UPDATE ai_settings SET credit_spent_micros = credit_spent_micros + ?, updated_at = ? WHERE id = ?',
      )
      .run(micros, new Date().toISOString(), ROW_ID);
  }
}
