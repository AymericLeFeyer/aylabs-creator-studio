import type { DatabaseSync } from 'node:sqlite';
import type {
  CreatePostDraftInput,
  PostDraft,
  UpdatePostDraftInput,
} from '../../../domain/postDraft/entities/PostDraft.ts';
import type { PostDraftRepository } from '../../../domain/postDraft/repositories/PostDraftRepository.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface PostDraftRow {
  id: string;
  title: string;
  description: string;
  planned_date: string | null;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: PostDraftRow): PostDraft => ({
  id: row.id,
  title: row.title,
  description: row.description,
  plannedDate: row.planned_date,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqlitePostDraftRepository implements PostDraftRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(): PostDraft[] {
    const rows = this.db
      .prepare('SELECT * FROM post_drafts ORDER BY planned_date IS NULL, planned_date, created_at')
      .all() as unknown as PostDraftRow[];
    return rows.map(toDomain);
  }

  findById(id: string): PostDraft | null {
    const row = this.db.prepare('SELECT * FROM post_drafts WHERE id = ?').get(id) as
      PostDraftRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreatePostDraftInput): PostDraft {
    const id = newId();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO post_drafts (id, title, description, planned_date, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(id, input.title, input.description ?? '', input.plannedDate ?? null, now, now);
    return this.findById(id)!;
  }

  update(id: string, input: UpdatePostDraftInput): PostDraft {
    const existing = this.findById(id);
    if (!existing) throw notFound('Brouillon');

    this.db
      .prepare(
        `UPDATE post_drafts SET title = ?, description = ?, planned_date = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(
        input.title ?? existing.title,
        input.description ?? existing.description,
        // `null` efface la date, absent la conserve.
        input.plannedDate === undefined ? existing.plannedDate : input.plannedDate,
        new Date().toISOString(),
        id,
      );
    return this.findById(id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM post_drafts WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Brouillon');
  }
}
