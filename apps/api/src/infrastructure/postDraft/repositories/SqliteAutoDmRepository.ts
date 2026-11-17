import type { DatabaseSync } from 'node:sqlite';
import type {
  AutoDmLogEntry,
  AutoDmRepository,
  AutoDmStats,
} from '../../../domain/postDraft/repositories/AutoDmRepository.ts';
import { newId } from '../../../shared/id.ts';

export class SqliteAutoDmRepository implements AutoDmRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  hasHandled(draftId: string, commentId: string, commenterKey: string): boolean {
    return (
      this.db
        .prepare(
          `SELECT 1 FROM ig_auto_dm_log
           WHERE comment_id = ? OR (draft_id = ? AND commenter_key = ?) LIMIT 1`,
        )
        .get(commentId, draftId, commenterKey) !== undefined
    );
  }

  record(entry: AutoDmLogEntry): void {
    this.db
      .prepare(
        `INSERT INTO ig_auto_dm_log
           (id, draft_id, comment_id, commenter_key, commenter_username, status, error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (comment_id) DO NOTHING`,
      )
      .run(
        newId(),
        entry.draftId,
        entry.commentId,
        entry.commenterKey,
        entry.commenterUsername,
        entry.status,
        entry.error,
        new Date().toISOString(),
      );
  }

  stats(draftId: string): AutoDmStats {
    const rows = this.db
      .prepare(
        `SELECT status, COUNT(*) AS n FROM ig_auto_dm_log WHERE draft_id = ? GROUP BY status`,
      )
      .all(draftId) as Array<{ status: string; n: number }>;
    const last = this.db
      .prepare(
        `SELECT error FROM ig_auto_dm_log
         WHERE draft_id = ? AND status = 'failed' ORDER BY created_at DESC LIMIT 1`,
      )
      .get(draftId) as { error: string | null } | undefined;
    return {
      sent: rows.find((row) => row.status === 'sent')?.n ?? 0,
      failed: rows.find((row) => row.status === 'failed')?.n ?? 0,
      lastError: last?.error ?? null,
    };
  }
}
