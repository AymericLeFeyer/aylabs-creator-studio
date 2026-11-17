import type { DatabaseSync } from 'node:sqlite';
import type { AiProvider, AiTask, StoredAiSettings } from '../../../domain/ai/entities/Ai.ts';
import type { AiSettingsRepository } from '../../../domain/ai/repositories/AiRepository.ts';

const ROW_IDS = { anthropic: 'default', openai: 'openai' } satisfies Record<AiProvider, string>;

const COLUMNS: Record<keyof StoredAiSettings, string> = {
  encryptedApiKey: 'api_key',
  model: 'model',
  creditBalanceCents: 'credit_balance_cents',
  creditSetAt: 'credit_set_at',
  creditSpentMicros: 'credit_spent_micros',
  creditExhaustedAt: 'credit_exhausted_at',
  creditUnpriced: 'credit_unpriced',
  encryptedAdminKey: 'admin_key',
};

interface Row {
  api_key: string | null;
  model: string | null;
  credit_balance_cents: number | null;
  credit_set_at: string | null;
  credit_spent_micros: number;
  credit_exhausted_at: string | null;
  credit_unpriced: number;
  admin_key: string | null;
}

/** Une ligne par fournisseur, avec les clés chiffrées. */
export class SqliteAiSettingsRepository implements AiSettingsRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  activeProvider(): AiProvider {
    const row = this.db
      .prepare('SELECT active_provider FROM ai_settings WHERE id = ?')
      .get(ROW_IDS.anthropic);
    return row?.active_provider === 'openai' ? 'openai' : 'anthropic';
  }

  routes(): Partial<Record<AiTask, AiProvider>> {
    const rows = this.db.prepare('SELECT task, provider FROM ai_task_routes').all() as Array<{
      task: AiTask;
      provider: AiProvider;
    }>;
    return Object.fromEntries(rows.map((row) => [row.task, row.provider]));
  }

  setRoute(task: AiTask, provider: AiProvider | null): void {
    if (provider === null) {
      this.db.prepare('DELETE FROM ai_task_routes WHERE task = ?').run(task);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO ai_task_routes (task, provider) VALUES (?, ?)
         ON CONFLICT (task) DO UPDATE SET provider = excluded.provider`,
      )
      .run(task, provider);
  }

  get(provider: AiProvider): StoredAiSettings {
    const row = this.db
      .prepare(
        `SELECT api_key, model, credit_balance_cents, credit_set_at, credit_spent_micros,
                credit_exhausted_at, credit_unpriced, admin_key
           FROM ai_settings WHERE id = ?`,
      )
      .get(ROW_IDS[provider]) as unknown as Row;
    return {
      encryptedApiKey: row.api_key,
      model: row.model,
      creditBalanceCents: row.credit_balance_cents,
      creditSetAt: row.credit_set_at,
      creditSpentMicros: row.credit_spent_micros,
      creditExhaustedAt: row.credit_exhausted_at,
      creditUnpriced: row.credit_unpriced !== 0,
      encryptedAdminKey: row.admin_key,
    };
  }

  update(provider: AiProvider, patch: Partial<StoredAiSettings>, activate?: AiProvider): void {
    const now = new Date().toISOString();
    const assignments: string[] = [];
    const values: Array<string | number | null> = [];
    for (const key of Object.keys(COLUMNS) as (keyof StoredAiSettings)[]) {
      const value = patch[key];
      if (value === undefined) continue;
      assignments.push(`${COLUMNS[key]} = ?`);
      values.push(typeof value === 'boolean' ? Number(value) : value);
    }
    this.db.exec('BEGIN');
    try {
      if (assignments.length) {
        this.db
          .prepare(`UPDATE ai_settings SET ${assignments.join(', ')}, updated_at = ? WHERE id = ?`)
          .run(...values, now, ROW_IDS[provider]);
      }
      if (activate) {
        this.db
          .prepare('UPDATE ai_settings SET active_provider = ? WHERE id = ?')
          .run(activate, ROW_IDS.anthropic);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  recordUsage(provider: AiProvider, micros: number | null): void {
    this.db
      .prepare(
        `UPDATE ai_settings
            SET credit_spent_micros = credit_spent_micros + ?,
                credit_unpriced = MAX(credit_unpriced, ?),
                credit_exhausted_at = NULL,
                updated_at = ?
          WHERE id = ?`,
      )
      .run(micros ?? 0, Number(micros === null), new Date().toISOString(), ROW_IDS[provider]);
  }
}
