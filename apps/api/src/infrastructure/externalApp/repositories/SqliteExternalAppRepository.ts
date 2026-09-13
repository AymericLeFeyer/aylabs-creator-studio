import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateExternalAppInput,
  ExternalApp,
  ExternalAppIcon,
  ExternalAppKind,
  ExternalAppSection,
  UpdateExternalAppInput,
} from '../../../domain/externalApp/entities/ExternalApp.ts';
import type { ExternalAppRepository } from '../../../domain/externalApp/repositories/ExternalAppRepository.ts';
import { newId } from '../../../shared/id.ts';
import { conflict, notFound } from '../../../shared/errors.ts';

interface Row {
  id: string;
  kind: ExternalAppKind;
  name: string;
  url: string | null;
  icon: ExternalAppIcon;
  section: ExternalAppSection;
  enabled: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: Row): ExternalApp => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  url: row.url,
  icon: row.icon,
  section: row.section,
  enabled: row.enabled === 1,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqliteExternalAppRepository implements ExternalAppRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(): ExternalApp[] {
    const rows = this.db
      .prepare('SELECT * FROM external_apps ORDER BY sort_order, name COLLATE NOCASE')
      .all() as unknown as Row[];
    return rows.map(toDomain);
  }

  findById(id: string): ExternalApp | null {
    const row = this.db.prepare('SELECT * FROM external_apps WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateExternalAppInput): ExternalApp {
    // L'index unique partiel le refuserait aussi, mais avec un message SQLite illisible.
    if (input.kind === 'todo' && this.findAll().some((app) => app.kind === 'todo')) {
      throw conflict('L’app Todo est déjà dans le menu.');
    }

    const id = newId();
    const now = new Date().toISOString();
    const count = (
      this.db.prepare('SELECT COUNT(*) AS n FROM external_apps').get() as { n: number }
    ).n;

    this.db
      .prepare(
        `INSERT INTO external_apps
           (id, kind, name, url, icon, section, enabled, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.kind,
        input.name,
        input.url ?? null,
        input.icon ?? (input.kind === 'todo' ? 'list-checks' : 'app-window'),
        input.section ?? 'production',
        input.enabled === false ? 0 : 1,
        count + 1,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateExternalAppInput): ExternalApp {
    const existing = this.findById(id);
    if (!existing) throw notFound('Application');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.name !== undefined) set('name', input.name);
    if (input.url !== undefined) set('url', input.url);
    if (input.icon !== undefined) set('icon', input.icon);
    if (input.section !== undefined) set('section', input.section);
    if (input.enabled !== undefined) set('enabled', input.enabled ? 1 : 0);
    if (input.sortOrder !== undefined) set('sort_order', input.sortOrder);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE external_apps SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  /** Rien n'en dépend : l'app vit ailleurs, le studio n'en garde que l'entrée de menu. */
  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM external_apps WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Application');
  }
}
