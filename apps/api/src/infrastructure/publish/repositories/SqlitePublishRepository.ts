import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateAttemptInput,
  PublishAttempt,
  PublishPlatform,
  PublishStatus,
  PublishUpload,
  PublishUploadView,
  UpdateAttemptInput,
  PublishPrivacy,
} from '../../../domain/publish/entities/Publish.ts';
import type { PublishRepository } from '../../../domain/publish/repositories/PublishRepository.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface UploadRow {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  public_token: string;
  created_at: string;
}

interface AttemptRow {
  id: string;
  upload_id: string;
  platform: PublishPlatform;
  target_id: string;
  target_name: string;
  status: PublishStatus;
  privacy: PublishPrivacy | null;
  title: string;
  external_id: string | null;
  url: string | null;
  error: string | null;
  thumbnail_set_at: string | null;
  created_at: string;
  updated_at: string;
}

const toUpload = (row: UploadRow): PublishUpload => ({
  id: row.id,
  fileName: row.file_name,
  mimeType: row.mime_type,
  sizeBytes: row.size_bytes,
  publicToken: row.public_token,
  createdAt: row.created_at,
});

const toAttempt = (row: AttemptRow): PublishAttempt => ({
  id: row.id,
  uploadId: row.upload_id,
  platform: row.platform,
  targetId: row.target_id,
  targetName: row.target_name,
  status: row.status,
  privacy: row.privacy,
  title: row.title,
  externalId: row.external_id,
  url: row.url,
  error: row.error,
  thumbnailSetAt: row.thumbnail_set_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqlitePublishRepository implements PublishRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  listUploads(): PublishUploadView[] {
    const uploads = this.db
      .prepare('SELECT * FROM publish_uploads ORDER BY created_at DESC')
      .all() as unknown as UploadRow[];
    const attempts = this.db
      .prepare('SELECT * FROM publish_attempts ORDER BY created_at DESC')
      .all() as unknown as AttemptRow[];
    return uploads.map((row) => ({
      ...toUpload(row),
      attempts: attempts.filter((a) => a.upload_id === row.id).map(toAttempt),
    }));
  }

  findUpload(id: string): PublishUpload | null {
    const row = this.db.prepare('SELECT * FROM publish_uploads WHERE id = ?').get(id) as
      UploadRow | undefined;
    return row ? toUpload(row) : null;
  }

  findUploadByToken(token: string): PublishUpload | null {
    const row = this.db
      .prepare('SELECT * FROM publish_uploads WHERE public_token = ?')
      .get(token) as UploadRow | undefined;
    return row ? toUpload(row) : null;
  }

  createUpload(input: Omit<PublishUpload, 'createdAt'>): PublishUpload {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO publish_uploads (id, file_name, mime_type, size_bytes, public_token, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(input.id, input.fileName, input.mimeType, input.sizeBytes, input.publicToken, now);
    return { ...input, createdAt: now };
  }

  deleteUpload(id: string): void {
    this.db.prepare('DELETE FROM publish_uploads WHERE id = ?').run(id);
  }

  findAttempt(id: string): PublishAttempt | null {
    const row = this.db.prepare('SELECT * FROM publish_attempts WHERE id = ?').get(id) as
      AttemptRow | undefined;
    return row ? toAttempt(row) : null;
  }

  createAttempt(input: CreateAttemptInput): PublishAttempt {
    const id = newId();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO publish_attempts
           (id, upload_id, platform, target_id, target_name, status, privacy, title,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.uploadId,
        input.platform,
        input.targetId,
        input.targetName,
        input.status,
        input.privacy ?? null,
        input.title ?? '',
        now,
        now,
      );
    return this.findAttempt(id)!;
  }

  updateAttempt(id: string, input: UpdateAttemptInput): PublishAttempt {
    const current = this.findAttempt(id);
    if (!current) throw notFound('Envoi');
    this.db
      .prepare(
        `UPDATE publish_attempts
            SET status = ?, external_id = ?, url = ?, error = ?, thumbnail_set_at = ?,
                updated_at = ?
          WHERE id = ?`,
      )
      .run(
        input.status ?? current.status,
        input.externalId === undefined ? current.externalId : input.externalId,
        input.url === undefined ? current.url : input.url,
        input.error === undefined ? current.error : input.error,
        input.thumbnailSetAt === undefined ? current.thumbnailSetAt : input.thumbnailSetAt,
        new Date().toISOString(),
        id,
      );
    return this.findAttempt(id)!;
  }

  failInterrupted(message: string): number {
    const result = this.db
      .prepare(
        `UPDATE publish_attempts SET status = 'failed', error = ?, updated_at = ?
          WHERE status IN ('uploading', 'processing', 'publishing')`,
      )
      .run(message, new Date().toISOString());
    return Number(result.changes);
  }
}
