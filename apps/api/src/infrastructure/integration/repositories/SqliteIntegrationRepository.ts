import type { DatabaseSync } from 'node:sqlite';
import type {
  IntegrationProvider,
  IntegrationSnapshot,
} from '../../../domain/integration/entities/Integration.ts';
import type {
  IntegrationRepository,
  StoredCredential,
} from '../../../domain/integration/repositories/IntegrationRepository.ts';

interface SnapshotRow {
  key: string;
  data: string | null;
  fetched_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  duration_ms: number | null;
}

/**
 * Réglages, identifiants et instantanés des intégrations.
 *
 * Le dépôt ne chiffre rien et ne déchiffre rien : il range ce qu'on lui donne. Le
 * chiffrement vit dans `ManageIntegrations`, seul à connaître le `SecretCipher` — si
 * bien qu'aucune lecture de ce dépôt ne peut, par mégarde, sortir un secret en clair.
 */
export class SqliteIntegrationRepository implements IntegrationRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  isEnabled(provider: IntegrationProvider): boolean {
    const row = this.db
      .prepare('SELECT enabled FROM integration_settings WHERE provider = ?')
      .get(provider) as { enabled: number } | undefined;
    return row ? row.enabled === 1 : true;
  }

  setEnabled(provider: IntegrationProvider, enabled: boolean): void {
    this.db
      .prepare(
        `INSERT INTO integration_settings (provider, enabled, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(provider) DO UPDATE SET enabled = excluded.enabled, updated_at = excluded.updated_at`,
      )
      .run(provider, enabled ? 1 : 0, new Date().toISOString());
  }

  storedCredentials(provider: IntegrationProvider): StoredCredential[] {
    const rows = this.db
      .prepare('SELECT key, value, is_secret FROM integration_credentials WHERE provider = ?')
      .all(provider) as Array<{ key: string; value: string; is_secret: number }>;
    return rows.map((row) => ({ key: row.key, value: row.value, isSecret: row.is_secret === 1 }));
  }

  setCredential(
    provider: IntegrationProvider,
    key: string,
    value: string | null,
    isSecret: boolean,
  ): void {
    if (value === null) {
      this.db
        .prepare('DELETE FROM integration_credentials WHERE provider = ? AND key = ?')
        .run(provider, key);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO integration_credentials (provider, key, value, is_secret, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(provider, key) DO UPDATE SET
           value = excluded.value, is_secret = excluded.is_secret, updated_at = excluded.updated_at`,
      )
      .run(provider, key, value, isSecret ? 1 : 0, new Date().toISOString());
  }

  snapshot(key: string): IntegrationSnapshot | null {
    const row = this.db.prepare('SELECT * FROM integration_snapshots WHERE key = ?').get(key) as
      SnapshotRow | undefined;
    if (!row) return null;
    return {
      key: row.key,
      data: row.data === null ? null : (JSON.parse(row.data) as unknown),
      fetchedAt: row.fetched_at,
      lastAttemptAt: row.last_attempt_at,
      lastError: row.last_error,
      durationMs: row.duration_ms,
    };
  }

  saveSuccess(key: string, data: unknown, durationMs: number): void {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO integration_snapshots (key, data, fetched_at, last_attempt_at, last_error, duration_ms)
         VALUES (?, ?, ?, ?, NULL, ?)
         ON CONFLICT(key) DO UPDATE SET
           data = excluded.data, fetched_at = excluded.fetched_at,
           last_attempt_at = excluded.last_attempt_at, last_error = NULL,
           duration_ms = excluded.duration_ms`,
      )
      .run(key, JSON.stringify(data), now, now, Math.round(durationMs));
  }

  saveFailure(key: string, error: string, durationMs: number): void {
    // `data` et `fetched_at` ne figurent pas dans le DO UPDATE : c'est toute la
    // garantie qu'un échec ne publie jamais du vide à la place de la dernière valeur.
    this.db
      .prepare(
        `INSERT INTO integration_snapshots (key, last_attempt_at, last_error, duration_ms)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           last_attempt_at = excluded.last_attempt_at, last_error = excluded.last_error,
           duration_ms = excluded.duration_ms`,
      )
      .run(key, new Date().toISOString(), error.slice(0, 1000), Math.round(durationMs));
  }
}
