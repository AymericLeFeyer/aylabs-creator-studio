import type { DatabaseSync } from 'node:sqlite';
import type {
  Channel,
  CreateChannelInput,
  UpdateChannelInput,
} from '../../../domain/channel/entities/Channel.ts';
import type { ChannelRepository } from '../../../domain/channel/repositories/ChannelRepository.ts';
import { fromSqlBool, toSqlBool } from '../../db/database.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface ChannelRow {
  id: string;
  name: string;
  platform: string;
  mode: string;
  external_id: string | null;
  handle: string | null;
  color: string;
  thumbnail_url: string | null;
  refresh_token: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: ChannelRow): Channel => ({
  id: row.id,
  name: row.name,
  platform: row.platform as Channel['platform'],
  mode: row.mode as Channel['mode'],
  externalId: row.external_id,
  handle: row.handle,
  color: row.color,
  thumbnailUrl: row.thumbnail_url,
  refreshToken: row.refresh_token,
  isArchived: fromSqlBool(row.is_archived),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const DEFAULT_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

export class SqliteChannelRepository implements ChannelRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(options: { includeArchived?: boolean } = {}): Channel[] {
    const sql = options.includeArchived
      ? 'SELECT * FROM channels ORDER BY name COLLATE NOCASE'
      : 'SELECT * FROM channels WHERE is_archived = 0 ORDER BY name COLLATE NOCASE';
    return (this.db.prepare(sql).all() as unknown as ChannelRow[]).map(toDomain);
  }

  findById(id: string): Channel | null {
    const row = this.db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as
      ChannelRow | undefined;
    return row ? toDomain(row) : null;
  }

  findByExternalId(externalId: string): Channel | null {
    const row = this.db.prepare('SELECT * FROM channels WHERE external_id = ?').get(externalId) as
      ChannelRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateChannelInput): Channel {
    const id = newId();
    const now = new Date().toISOString();
    // Couleur attribuée en rotation pour que deux chaînes ne se confondent pas au premier coup d'œil.
    const count = (this.db.prepare('SELECT COUNT(*) AS n FROM channels').get() as { n: number }).n;
    const color = input.color ?? DEFAULT_COLORS[count % DEFAULT_COLORS.length]!;

    this.db
      .prepare(
        `INSERT INTO channels
           (id, name, platform, mode, external_id, handle, color, thumbnail_url,
            refresh_token, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.platform ?? 'youtube',
        input.mode,
        input.externalId ?? null,
        input.handle ?? null,
        color,
        input.thumbnailUrl ?? null,
        input.refreshToken ?? null,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateChannelInput): Channel {
    const existing = this.findById(id);
    if (!existing) throw notFound('Chaîne');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.name !== undefined) set('name', input.name);
    if (input.mode !== undefined) set('mode', input.mode);
    if (input.externalId !== undefined) set('external_id', input.externalId);
    if (input.handle !== undefined) set('handle', input.handle);
    if (input.color !== undefined) set('color', input.color);
    if (input.thumbnailUrl !== undefined) set('thumbnail_url', input.thumbnailUrl);
    if (input.isArchived !== undefined) set('is_archived', toSqlBool(input.isArchived));
    // Une chaîne vide efface le token ; `undefined` le laisse intact (le front ne le renvoie jamais).
    if (input.refreshToken !== undefined) {
      set('refresh_token', input.refreshToken === '' ? null : input.refreshToken);
    }

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE channels SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM channels WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Chaîne');
  }
}
