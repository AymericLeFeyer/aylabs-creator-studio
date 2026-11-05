import type { DatabaseSync } from 'node:sqlite';
import type {
  SaveTikTokConnectionInput,
  TikTokConnection,
} from '../../../domain/tiktok/entities/TikTokConnection.ts';
import type { TikTokConnectionRepository } from '../../../domain/tiktok/repositories/TikTokConnectionRepository.ts';
import { notFound } from '../../../shared/errors.ts';
import { newId } from '../../../shared/id.ts';

interface Row {
  id: string;
  open_id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  scopes: string;
  access_token: string;
  refresh_token: string;
  access_expires_at: string;
  refresh_expires_at: string;
  created_at: string;
  updated_at: string;
}

const toConnection = (row: Row): TikTokConnection => ({
  id: row.id,
  openId: row.open_id,
  username: row.username,
  displayName: row.display_name,
  avatarUrl: row.avatar_url,
  scopes: row.scopes.split(',').filter(Boolean),
  encryptedAccessToken: row.access_token,
  encryptedRefreshToken: row.refresh_token,
  accessExpiresAt: row.access_expires_at,
  refreshExpiresAt: row.refresh_expires_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqliteTikTokConnectionRepository implements TikTokConnectionRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(): TikTokConnection[] {
    return (
      this.db
        .prepare('SELECT * FROM tiktok_connections ORDER BY created_at')
        .all() as unknown as Row[]
    ).map(toConnection);
  }

  findById(id: string): TikTokConnection | null {
    const row = this.db.prepare('SELECT * FROM tiktok_connections WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toConnection(row) : null;
  }

  save(input: SaveTikTokConnectionInput): TikTokConnection {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO tiktok_connections
           (id, open_id, username, display_name, avatar_url, scopes, access_token,
            refresh_token, access_expires_at, refresh_expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (open_id) DO UPDATE SET
           username = excluded.username,
           display_name = excluded.display_name,
           avatar_url = excluded.avatar_url,
           scopes = excluded.scopes,
           access_token = excluded.access_token,
           refresh_token = excluded.refresh_token,
           access_expires_at = excluded.access_expires_at,
           refresh_expires_at = excluded.refresh_expires_at,
           updated_at = excluded.updated_at`,
      )
      .run(
        newId(),
        input.openId,
        input.username,
        input.displayName,
        input.avatarUrl,
        input.scopes.join(','),
        input.encryptedAccessToken,
        input.encryptedRefreshToken,
        input.accessExpiresAt,
        input.refreshExpiresAt,
        now,
        now,
      );
    const row = this.db
      .prepare('SELECT * FROM tiktok_connections WHERE open_id = ?')
      .get(input.openId) as unknown as Row;
    return toConnection(row);
  }

  updateTokens(
    id: string,
    tokens: Pick<
      SaveTikTokConnectionInput,
      'encryptedAccessToken' | 'encryptedRefreshToken' | 'accessExpiresAt' | 'refreshExpiresAt'
    >,
  ): void {
    this.db
      .prepare(
        `UPDATE tiktok_connections
            SET access_token = ?, refresh_token = ?, access_expires_at = ?,
                refresh_expires_at = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(
        tokens.encryptedAccessToken,
        tokens.encryptedRefreshToken,
        tokens.accessExpiresAt,
        tokens.refreshExpiresAt,
        new Date().toISOString(),
        id,
      );
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM tiktok_connections WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Connexion TikTok');
  }
}
