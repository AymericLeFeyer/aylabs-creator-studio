import type { DatabaseSync } from 'node:sqlite';
import {
  isPostDraftComplete,
  isShortOnline,
  parseShortOptions,
  POST_DRAFT_STEPS,
  SHORT_PLATFORMS,
  type CreatePostDraftInput,
  type PostDraft,
  type PostDraftStep,
  type PostDraftSummary,
  type UpdatePostDraftInput,
} from '../../../domain/postDraft/entities/PostDraft.ts';
import type { PostDraftRepository } from '../../../domain/postDraft/repositories/PostDraftRepository.ts';
import type { PublishAttempt, PublishPlatform } from '../../../domain/publish/entities/Publish.ts';
import { newId } from '../../../shared/id.ts';
import { conflict, notFound } from '../../../shared/errors.ts';
import { toAttempt, type AttemptRow } from '../../publish/repositories/SqlitePublishRepository.ts';

interface PostDraftRow {
  id: string;
  title: string;
  description: string;
  planned_date: string | null;
  production_id: string | null;
  steps: string;
  archived_at: string | null;
  upload_id: string | null;
  scheduled_at: string | null;
  platforms: string;
  publish_started_at: string | null;
  publish_options: string;
  cover_updated_at: string | null;
  created_at: string;
  updated_at: string;
  // La vidéo, par `LEFT JOIN` sur `publish_uploads`.
  video_file_name: string | null;
  video_mime_type: string | null;
  video_size_bytes: number | null;
  video_public_token: string | null;
  video_created_at: string | null;
}

/** Toutes les lectures passent par là : la vidéo vient avec la ligne. */
const SELECT = `
  SELECT d.*, u.file_name AS video_file_name, u.mime_type AS video_mime_type,
         u.size_bytes AS video_size_bytes, u.public_token AS video_public_token,
         u.created_at AS video_created_at, c.updated_at AS cover_updated_at
    FROM post_drafts d
    LEFT JOIN publish_uploads u ON u.id = d.upload_id
    LEFT JOIN post_draft_covers c ON c.draft_id = d.id`;

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

/** Même principe que les cases : ordre canonique, valeurs inconnues ignorées. */
const parsePlatforms = (raw: string): PublishPlatform[] => {
  const present = new Set(raw.split(','));
  return SHORT_PLATFORMS.filter((platform) => present.has(platform));
};

const serializePlatforms = (platforms: readonly PublishPlatform[]): string =>
  SHORT_PLATFORMS.filter((platform) => platforms.includes(platform)).join(',');

const toDomain = (row: PostDraftRow, attempts: PublishAttempt[]): PostDraft => ({
  id: row.id,
  title: row.title,
  description: row.description,
  plannedDate: row.planned_date,
  productionId: row.production_id,
  steps: parseSteps(row.steps),
  archivedAt: row.archived_at,
  video:
    row.upload_id && row.video_public_token
      ? {
          id: row.upload_id,
          fileName: row.video_file_name ?? 'video',
          mimeType: row.video_mime_type ?? 'video/mp4',
          sizeBytes: row.video_size_bytes ?? 0,
          url: `/api/publish/files/${row.video_public_token}`,
          createdAt: row.video_created_at ?? row.created_at,
        }
      : null,
  scheduledAt: row.scheduled_at,
  platforms: parsePlatforms(row.platforms),
  publishStartedAt: row.publish_started_at,
  attempts,
  options: parseShortOptions(row.publish_options),
  cover: row.cover_updated_at
    ? {
        url: `/api/publish/drafts/${row.id}/cover?v=${encodeURIComponent(row.cover_updated_at)}`,
        updatedAt: row.cover_updated_at,
      }
    : null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqlitePostDraftRepository implements PostDraftRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /**
   * Les envois des vidéos du lot, en **une** requête : les joindre à la ligne produirait
   * une ligne par envoi, à dédoublonner.
   */
  private hydrate(rows: PostDraftRow[]): PostDraft[] {
    const uploadIds = [
      ...new Set(rows.map((row) => row.upload_id).filter((id): id is string => id !== null)),
    ];
    const attempts = uploadIds.length
      ? (this.db
          .prepare(
            `SELECT * FROM publish_attempts
              WHERE upload_id IN (${uploadIds.map(() => '?').join(',')})
              ORDER BY created_at DESC`,
          )
          .all(...uploadIds) as unknown as AttemptRow[])
      : [];
    return rows.map((row) =>
      toDomain(
        row,
        attempts.filter((attempt) => attempt.upload_id === row.upload_id).map(toAttempt),
      ),
    );
  }

  findAll(options: { archived?: boolean } = {}): PostDraft[] {
    const rows = (options.archived
      ? this.db
          .prepare(`${SELECT} WHERE d.archived_at IS NOT NULL ORDER BY d.archived_at DESC`)
          .all()
      : this.db
          .prepare(
            `${SELECT} WHERE d.archived_at IS NULL
                ORDER BY d.planned_date IS NULL, d.planned_date, d.scheduled_at IS NULL,
                         d.scheduled_at, d.created_at`,
          )
          .all()) as unknown as PostDraftRow[];
    return this.hydrate(rows);
  }

  findByProduction(productionId: string): PostDraft[] {
    const rows = this.db
      .prepare(
        `${SELECT} WHERE d.production_id = ?
            ORDER BY d.planned_date IS NULL, d.planned_date, d.created_at`,
      )
      .all(productionId) as unknown as PostDraftRow[];
    return this.hydrate(rows);
  }

  findById(id: string): PostDraft | null {
    const row = this.db.prepare(`${SELECT} WHERE d.id = ?`).get(id) as PostDraftRow | undefined;
    return row ? this.hydrate([row])[0]! : null;
  }

  findDue(now: string): PostDraft[] {
    const rows = this.db
      .prepare(
        `${SELECT} WHERE d.publish_started_at IS NULL AND d.archived_at IS NULL
            AND d.scheduled_at IS NOT NULL AND d.scheduled_at <= ?
            AND d.upload_id IS NOT NULL AND d.platforms <> ''
          ORDER BY d.scheduled_at`,
      )
      .all(now) as unknown as PostDraftRow[];
    return this.hydrate(rows);
  }

  markStarted(id: string, at: string): boolean {
    const result = this.db
      .prepare(
        `UPDATE post_drafts SET publish_started_at = ?, updated_at = ?
          WHERE id = ? AND publish_started_at IS NULL`,
      )
      .run(at, at, id);
    return Number(result.changes) > 0;
  }

  setVideo(id: string, uploadId: string | null): { previousUploadId: string | null } {
    const row = this.db.prepare('SELECT upload_id FROM post_drafts WHERE id = ?').get(id) as
      { upload_id: string | null } | undefined;
    if (!row) throw notFound('Publication');
    this.db
      .prepare('UPDATE post_drafts SET upload_id = ?, updated_at = ? WHERE id = ?')
      .run(uploadId, new Date().toISOString(), id);
    return { previousUploadId: row.upload_id };
  }

  cover(id: string): { data: Buffer; mimeType: string } | null {
    const row = this.db
      .prepare('SELECT data, mime_type FROM post_draft_covers WHERE draft_id = ?')
      .get(id) as { data: Uint8Array; mime_type: string } | undefined;
    return row ? { data: Buffer.from(row.data), mimeType: row.mime_type } : null;
  }

  setCover(id: string, image: { data: Buffer; mimeType: string } | null): void {
    if (!this.findById(id)) throw notFound('Publication');
    if (!image) {
      this.db.prepare('DELETE FROM post_draft_covers WHERE draft_id = ?').run(id);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO post_draft_covers (draft_id, data, mime_type, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (draft_id) DO UPDATE SET data = excluded.data,
           mime_type = excluded.mime_type, updated_at = excluded.updated_at`,
      )
      .run(id, image.data, image.mimeType, new Date().toISOString());
  }

  linkedUploadIds(): Set<string> {
    const rows = this.db
      .prepare('SELECT upload_id FROM post_drafts WHERE upload_id IS NOT NULL')
      .all() as unknown as Array<{ upload_id: string }>;
    return new Set(rows.map((row) => row.upload_id));
  }

  /**
   * Ce que lit la pastille « -X jours » : **le dernier instant où un short est paru** — la
   * première plateforme qui l'a mis en ligne (un short sur trois plateformes compte une fois,
   * à son premier succès) —, et le nombre de shorts pas encore parus. Les publications
   * archivées avec leurs six cases, d'avant l'écran Shorts, comptent à leur date d'archivage.
   */
  summary(): PostDraftSummary {
    const online = this.db
      .prepare(
        `SELECT MAX(first_online) AS at FROM (
           SELECT MIN(a.updated_at) AS first_online
             FROM publish_attempts a
             JOIN post_drafts d ON d.upload_id = a.upload_id
            WHERE a.status IN ('published', 'ready') AND d.publish_started_at IS NOT NULL
            GROUP BY d.id)`,
      )
      .get() as { at: string | null };
    const legacy = this.db
      .prepare(
        'SELECT steps, archived_at FROM post_drafts WHERE archived_at IS NOT NULL ORDER BY archived_at DESC',
      )
      .all() as unknown as Array<{ steps: string; archived_at: string }>;
    const archivedAt = legacy.find((row) =>
      isPostDraftComplete(parseSteps(row.steps)),
    )?.archived_at;
    const candidates = [online.at, archivedAt].filter((value): value is string => Boolean(value));
    const lastPublishedAt = candidates.sort().at(-1) ?? null;
    const pending = this.findAll().filter((draft) => !isShortOnline(draft)).length;
    return { lastPublishedAt, pending };
  }

  create(input: CreatePostDraftInput): PostDraft {
    const id = newId();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO post_drafts
           (id, title, description, planned_date, production_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.title,
        input.description ?? '',
        input.plannedDate ?? null,
        input.productionId ?? null,
        now,
        now,
      );
    return this.findById(id)!;
  }

  update(id: string, input: UpdatePostDraftInput): PostDraft {
    const existing = this.findById(id);
    if (!existing) throw notFound('Brouillon');
    const now = new Date().toISOString();
    // Une fois lancée, une mise en ligne ne se reprogramme pas : les envois sont partis.
    if (
      existing.publishStartedAt &&
      (input.scheduledAt !== undefined || input.platforms !== undefined)
    ) {
      throw conflict('La mise en ligne est déjà lancée : l’heure et les plateformes sont figées');
    }

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
            SET title = ?, description = ?, planned_date = ?, production_id = ?, steps = ?,
                archived_at = ?, scheduled_at = ?, platforms = ?, publish_options = ?,
                updated_at = ?
          WHERE id = ?`,
      )
      .run(
        input.title ?? existing.title,
        input.description ?? existing.description,
        // `null` efface la date, absent la conserve.
        input.plannedDate === undefined ? existing.plannedDate : input.plannedDate,
        input.productionId === undefined ? existing.productionId : input.productionId,
        serializeSteps(input.steps ?? existing.steps),
        archivedAt,
        input.scheduledAt === undefined ? existing.scheduledAt : input.scheduledAt,
        serializePlatforms(input.platforms ?? existing.platforms),
        JSON.stringify(input.options ?? existing.options),
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
