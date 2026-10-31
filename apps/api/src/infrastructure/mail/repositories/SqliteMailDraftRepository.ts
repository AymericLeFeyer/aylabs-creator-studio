import type { DatabaseSync } from 'node:sqlite';
import type { MailDraft } from '../../../domain/mail/entities/Mail.ts';
import type { MailDraftRepository } from '../../../domain/mail/repositories/MailRepository.ts';
import { newId } from '../../../shared/id.ts';

interface Row {
  id: string;
  thread_id: string;
  from_address: string | null;
  to_json: string;
  cc_json: string;
  subject: string;
  body: string;
  signature: string;
  created_at: string;
}

const toDomain = (row: Row): MailDraft => ({
  id: row.id,
  threadId: row.thread_id,
  from: row.from_address,
  to: JSON.parse(row.to_json) as MailDraft['to'],
  cc: JSON.parse(row.cc_json) as MailDraft['cc'],
  subject: row.subject,
  body: row.body,
  signature: row.signature,
  createdAt: row.created_at,
});

/** Les réponses préparées par le MCP. Seule l'empreinte du jeton de confirmation est gardée. */
export class SqliteMailDraftRepository implements MailDraftRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  create(draft: Omit<MailDraft, 'id' | 'createdAt'>, tokenHash: string): MailDraft {
    const id = newId();
    this.db
      .prepare(
        `INSERT INTO mail_drafts
           (id, thread_id, from_address, to_json, cc_json, subject, body, signature, token_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        draft.threadId,
        draft.from,
        JSON.stringify(draft.to),
        JSON.stringify(draft.cc),
        draft.subject,
        draft.body,
        draft.signature,
        tokenHash,
        new Date().toISOString(),
      );
    return this.find(id)!;
  }

  find(id: string): MailDraft | null {
    const row = this.db.prepare('SELECT * FROM mail_drafts WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toDomain(row) : null;
  }

  findByToken(id: string, tokenHash: string): MailDraft | null {
    const row = this.db
      .prepare('SELECT * FROM mail_drafts WHERE id = ? AND token_hash = ?')
      .get(id, tokenHash) as Row | undefined;
    return row ? toDomain(row) : null;
  }

  claim(id: string): boolean {
    const result = this.db
      .prepare('UPDATE mail_drafts SET sending_at = ? WHERE id = ? AND sending_at IS NULL')
      .run(new Date().toISOString(), id);
    return result.changes > 0;
  }

  release(id: string): void {
    this.db.prepare('UPDATE mail_drafts SET sending_at = NULL WHERE id = ?').run(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM mail_drafts WHERE id = ?').run(id);
  }

  deleteOlderThan(iso: string): void {
    this.db.prepare('DELETE FROM mail_drafts WHERE created_at < ?').run(iso);
  }
}
