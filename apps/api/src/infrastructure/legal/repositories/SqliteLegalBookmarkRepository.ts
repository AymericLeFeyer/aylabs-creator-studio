import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateLegalBookmarkInput,
  LegalBookmark,
  UpdateLegalBookmarkInput,
} from '../../../domain/legal/entities/LegalBookmark.ts';
import type { LegalBookmarkRepository } from '../../../domain/legal/repositories/LegalRepository.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface BookmarkRow {
  id: string;
  label: string;
  url: string;
  description: string | null;
  image_url: string | null;
  color: string;
  sort_order: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: BookmarkRow): LegalBookmark => ({
  id: row.id,
  label: row.label,
  url: row.url,
  description: row.description,
  imageUrl: row.image_url,
  color: row.color,
  sortOrder: row.sort_order,
  isArchived: row.is_archived === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Même palette que les chaînes et les marques, attribuée en rotation : sans elle, cinq
 * favoris sans image se ressembleraient tous, et la vignette de repli ne servirait à
 * rien.
 */
const DEFAULT_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#ef4444',
  '#f97316',
];

export class SqliteLegalBookmarkRepository implements LegalBookmarkRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(includeArchived = false): LegalBookmark[] {
    const clause = includeArchived ? '' : 'WHERE is_archived = 0';
    const rows = this.db
      .prepare(`SELECT * FROM legal_bookmarks ${clause} ORDER BY sort_order, label COLLATE NOCASE`)
      .all() as unknown as BookmarkRow[];
    return rows.map(toDomain);
  }

  findById(id: string): LegalBookmark | null {
    const row = this.db.prepare('SELECT * FROM legal_bookmarks WHERE id = ?').get(id) as
      BookmarkRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateLegalBookmarkInput): LegalBookmark {
    const id = newId();
    const now = new Date().toISOString();

    const count = (
      this.db.prepare('SELECT COUNT(*) AS n FROM legal_bookmarks').get() as { n: number }
    ).n;
    const nextOrder = input.sortOrder ?? count + 1;

    this.db
      .prepare(
        `INSERT INTO legal_bookmarks
           (id, label, url, description, image_url, color, sort_order, is_archived,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        id,
        input.label,
        input.url,
        input.description ?? null,
        input.imageUrl ?? null,
        input.color ?? DEFAULT_COLORS[count % DEFAULT_COLORS.length]!,
        nextOrder,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateLegalBookmarkInput): LegalBookmark {
    const existing = this.findById(id);
    if (!existing) throw notFound('Favori');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.label !== undefined) set('label', input.label);
    if (input.url !== undefined) set('url', input.url);
    if (input.description !== undefined) set('description', input.description);
    if (input.imageUrl !== undefined) set('image_url', input.imageUrl);
    if (input.color !== undefined) set('color', input.color);
    if (input.sortOrder !== undefined) set('sort_order', input.sortOrder);
    if (input.isArchived !== undefined) set('is_archived', input.isArchived ? 1 : 0);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE legal_bookmarks SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  /**
   * Rien ne dépend d'un favori : il ne porte aucun historique et aucune case cochée.
   * Il se supprime donc franchement, contrairement à une obligation, qu'on archive pour
   * garder les mois déjà cochés.
   */
  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM legal_bookmarks WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Favori');
  }
}
