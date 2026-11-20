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
           (id, draft_id, comment_id, commenter_key, commenter_username, status, error,
            reply_status, reply_error, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (comment_id) DO NOTHING`,
      )
      .run(
        newId(),
        entry.draftId,
        entry.commentId,
        entry.commenterKey,
        entry.commenterUsername,
        entry.status,
        entry.error,
        entry.replyStatus,
        entry.replyError,
        new Date().toISOString(),
      );
  }

  setReply(commentId: string, status: 'sent' | 'failed', error: string | null): void {
    this.db
      .prepare(`UPDATE ig_auto_dm_log SET reply_status = ?, reply_error = ? WHERE comment_id = ?`)
      .run(status, error, commentId);
  }

  repliesSent(draftId: string): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM ig_auto_dm_log WHERE draft_id = ? AND reply_status = 'sent'`,
      )
      .get(draftId) as { n: number };
    return row.n;
  }

  stats(draftId: string): AutoDmStats {
    const count = (column: 'status' | 'reply_status', value: string): number =>
      (
        this.db
          .prepare(`SELECT COUNT(*) AS n FROM ig_auto_dm_log WHERE draft_id = ? AND ${column} = ?`)
          .get(draftId, value) as { n: number }
      ).n;
    const last = this.db
      .prepare(
        `SELECT COALESCE(error, reply_error) AS error FROM ig_auto_dm_log
         WHERE draft_id = ? AND (status = 'failed' OR reply_status = 'failed')
         ORDER BY created_at DESC LIMIT 1`,
      )
      .get(draftId) as { error: string | null } | undefined;
    return {
      sent: count('status', 'sent'),
      failed: count('status', 'failed'),
      replied: count('reply_status', 'sent'),
      replyFailed: count('reply_status', 'failed'),
      lastError: last?.error ?? null,
    };
  }
}
