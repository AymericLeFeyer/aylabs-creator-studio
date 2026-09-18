import type { DatabaseSync } from 'node:sqlite';
import {
  isPostDraftComplete,
  POST_DRAFT_STEPS,
  type CreatePostDraftInput,
  type PostDraft,
  type PostDraftStep,
  type PostDraftSummary,
  type UpdatePostDraftInput,
} from '../../../domain/postDraft/entities/PostDraft.ts';
import type { PostDraftRepository } from '../../../domain/postDraft/repositories/PostDraftRepository.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface PostDraftRow {
  id: string;
  title: string;
  description: string;
  planned_date: string | null;
  steps: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Les cases, lues et écrites **dans l'ordre canonique** et filtrées sur la liste connue :
 * une clé retirée du code un jour disparaît à la lecture au lieu de casser l'écran.
 */
const parseSteps = (raw: string): PostDraftStep[] => {
  const present = new Set(raw.split(','));
  return POST_DRAFT_STEPS.filter((step) => present.has(step));
};

const serializeSteps = (steps: readonly PostDraftStep[]): string =>
  POST_DRAFT_STEPS.filter((step) => steps.includes(step)).join(',');

const toDomain = (row: PostDraftRow): PostDraft => ({
  id: row.id,
  title: row.title,
  description: row.description,
  plannedDate: row.planned_date,
  steps: parseSteps(row.steps),
  archivedAt: row.archived_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqlitePostDraftRepository implements PostDraftRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(options: { archived?: boolean } = {}): PostDraft[] {
    const rows = (options.archived
      ? this.db
          .prepare(
            'SELECT * FROM post_drafts WHERE archived_at IS NOT NULL ORDER BY archived_at DESC',
          )
          .all()
      : this.db
          .prepare(
            `SELECT * FROM post_drafts WHERE archived_at IS NULL
                ORDER BY planned_date IS NULL, planned_date, created_at`,
          )
          .all()) as unknown as PostDraftRow[];
    return rows.map(toDomain);
  }

  findById(id: string): PostDraft | null {
    const row = this.db.prepare('SELECT * FROM post_drafts WHERE id = ?').get(id) as
      PostDraftRow | undefined;
    return row ? toDomain(row) : null;
  }

  /**
   * La dernière publication **validée** : archivée avec toutes ses cases. Un brouillon
   * archivé à moitié est un abandon, pas une publication — il ne doit pas remettre le
   * compteur du menu à zéro. Parcours en mémoire : on en archive quelques-uns par semaine.
   */
  summary(): PostDraftSummary {
    const archived = this.db
      .prepare(
        'SELECT steps, archived_at FROM post_drafts WHERE archived_at IS NOT NULL ORDER BY archived_at DESC',
      )
      .all() as unknown as Array<{ steps: string; archived_at: string }>;
    const last = archived.find((row) => isPostDraftComplete(parseSteps(row.steps)));
    const pending = this.db
      .prepare('SELECT COUNT(*) AS n FROM post_drafts WHERE archived_at IS NULL')
      .get() as { n: number };
    return { lastPublishedAt: last?.archived_at ?? null, pending: pending.n };
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
    const now = new Date().toISOString();

    // Réarchiver ne repousse pas la date : elle dit quand la publication a été validée.
    const archivedAt =
      input.archived === undefined
        ? existing.archivedAt
        : input.archived
          ? (existing.archivedAt ?? now)
          : null;

    this.db
      .prepare(
        `UPDATE post_drafts
            SET title = ?, description = ?, planned_date = ?, steps = ?, archived_at = ?,
                updated_at = ?
          WHERE id = ?`,
      )
      .run(
        input.title ?? existing.title,
        input.description ?? existing.description,
        // `null` efface la date, absent la conserve.
        input.plannedDate === undefined ? existing.plannedDate : input.plannedDate,
        serializeSteps(input.steps ?? existing.steps),
        archivedAt,
        now,
        id,
      );
    return this.findById(id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM post_drafts WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Brouillon');
  }
}
