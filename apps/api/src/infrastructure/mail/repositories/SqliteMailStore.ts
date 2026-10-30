import type { DatabaseSync } from 'node:sqlite';
import type {
  MailAddress,
  MailMessage,
  MailThreadFilter,
  MailThreadLinks,
  MailThreadSummary,
  MailThreadView,
  NewMailMessage,
} from '../../../domain/mail/entities/Mail.ts';
import type {
  MailFolderState,
  MailStore,
} from '../../../domain/mail/repositories/MailRepository.ts';
import { rootOf, threadKey } from '../../../domain/mail/services/threading.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface MessageRow {
  id: string;
  folder: string;
  uid: number;
  message_id: string;
  in_reply_to: string | null;
  refs: string;
  thread_id: string;
  from_name: string;
  from_address: string;
  to_json: string;
  cc_json: string;
  subject: string;
  date: string;
  snippet: string;
  text_body: string;
  html_body: string | null;
  attachments_json: string;
  seen: number;
  outgoing: number;
  ai_summary: string | null;
  removed_at: string | null;
}

interface ThreadRow {
  thread_id: string;
  message_count: number;
  unread_count: number;
  active_incoming: number;
  last_date: string;
  has_attachments: number;
  brand_id: string | null;
  brand_name: string | null;
  brand_color: string | null;
  production_id: string | null;
  production_title: string | null;
  summary: string | null;
  summary_at: string | null;
  note_id: string | null;
}

const parse = <T>(json: string, fallback: T): T => {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
};

const toDomain = (row: MessageRow): MailMessage => ({
  id: row.id,
  folder: row.folder,
  uid: row.uid,
  messageId: row.message_id,
  inReplyTo: row.in_reply_to,
  references: row.refs ? row.refs.split(' ').filter(Boolean) : [],
  threadId: row.thread_id,
  from: { name: row.from_name, address: row.from_address },
  to: parse<MailAddress[]>(row.to_json, []),
  cc: parse<MailAddress[]>(row.cc_json, []),
  subject: row.subject,
  date: row.date,
  snippet: row.snippet,
  textBody: row.text_body,
  htmlBody: row.html_body,
  attachments: parse(row.attachments_json, []),
  seen: row.seen === 1,
  outgoing: row.outgoing === 1,
  aiSummary: row.ai_summary,
  removedAt: row.removed_at,
});

/**
 * Les agrégats d'un fil, calculés à la lecture : le nombre de messages, ce qui reste à
 * lire, la dernière date. Rien n'est dénormalisé — une collecte n'a jamais à recompter.
 * `active_incoming` dit si le fil est encore dans la boîte de réception sur le serveur.
 */
const THREAD_SQL = `
  SELECT t.*, th.brand_id, b.name AS brand_name, b.color AS brand_color,
         th.production_id, p.title AS production_title,
         th.summary, th.summary_at, th.note_id
    FROM (
      SELECT thread_id,
             COUNT(*) AS message_count,
             SUM(CASE WHEN seen = 0 AND outgoing = 0 AND removed_at IS NULL THEN 1 ELSE 0 END) AS unread_count,
             SUM(CASE WHEN outgoing = 0 AND removed_at IS NULL THEN 1 ELSE 0 END) AS active_incoming,
             MAX(date) AS last_date,
             MAX(CASE WHEN attachments_json <> '[]' THEN 1 ELSE 0 END) AS has_attachments
        FROM mail_messages
       GROUP BY thread_id
    ) t
    LEFT JOIN mail_threads th ON th.id = t.thread_id
    LEFT JOIN brands b ON b.id = th.brand_id
    LEFT JOIN productions p ON p.id = th.production_id
`;

export class SqliteMailStore implements MailStore {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  // --- Dossiers ---------------------------------------------------------------

  folders(): MailFolderState[] {
    const rows = this.db.prepare('SELECT * FROM mail_folders').all() as unknown as Array<{
      path: string;
      role: 'inbox' | 'sent';
      uid_validity: string | null;
      last_uid: number;
    }>;
    return rows.map((row) => ({
      path: row.path,
      role: row.role,
      uidValidity: row.uid_validity,
      lastUid: row.last_uid,
    }));
  }

  saveFolder(state: MailFolderState): void {
    this.db
      .prepare(
        `INSERT INTO mail_folders (path, role, uid_validity, last_uid) VALUES (?, ?, ?, ?)
         ON CONFLICT (path) DO UPDATE SET role = excluded.role,
           uid_validity = excluded.uid_validity, last_uid = excluded.last_uid`,
      )
      .run(state.path, state.role, state.uidValidity, state.lastUid);
  }

  resetFolder(path: string): void {
    // Les fils et leurs rattachements restent : ils vivent dans "mail_threads", et les
    // messages réimportés retrouveront le même fil par leurs en-têtes.
    this.db.prepare('DELETE FROM mail_messages WHERE folder = ?').run(path);
    this.db.prepare('UPDATE mail_folders SET last_uid = 0 WHERE path = ?').run(path);
  }

  // --- Messages ---------------------------------------------------------------

  insert(message: NewMailMessage): void {
    const exists = this.db
      .prepare('SELECT 1 FROM mail_messages WHERE folder = ? AND uid = ?')
      .get(message.folder, message.uid);
    if (exists) return;

    this.db
      .prepare(
        `INSERT INTO mail_messages (id, folder, uid, message_id, in_reply_to, refs, thread_id,
           from_name, from_address, to_json, cc_json, subject, date, snippet, text_body,
           html_body, attachments_json, seen, outgoing, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        newId(),
        message.folder,
        message.uid,
        message.messageId,
        message.inReplyTo,
        message.references.join(' '),
        this.resolveThread(message),
        message.from.name,
        message.from.address,
        JSON.stringify(message.to),
        JSON.stringify(message.cc),
        message.subject,
        message.date,
        message.snippet,
        message.textBody,
        message.htmlBody,
        JSON.stringify(message.attachments),
        message.seen ? 1 : 0,
        message.outgoing ? 1 : 0,
        new Date().toISOString(),
      );
  }

  /**
   * Le fil d'un message : celui d'un message qu'il cite s'il est connu, sinon celui d'un
   * message déjà reçu qui le cite (une réponse arrivée avant l'original), sinon sa racine.
   * Les deux premières lectures rattrapent les fils dont les `References` sont incomplètes
   * — certains clients n'y gardent que le dernier maillon.
   */
  private resolveThread(message: NewMailMessage): string {
    const cited = [message.inReplyTo, ...message.references].filter(
      (value): value is string => !!value,
    );
    if (cited.length > 0) {
      const row = this.db
        .prepare(
          `SELECT thread_id FROM mail_messages
            WHERE message_id IN (${cited.map(() => '?').join(', ')}) LIMIT 1`,
        )
        .get(...cited) as { thread_id: string } | undefined;
      if (row) return row.thread_id;
    }
    const citing = this.db
      .prepare(
        `SELECT thread_id FROM mail_messages
          WHERE in_reply_to = ? OR instr(refs, ?) > 0 LIMIT 1`,
      )
      .get(message.messageId, message.messageId) as { thread_id: string } | undefined;
    return citing?.thread_id ?? threadKey(rootOf(message));
  }

  knownUids(folder: string, sinceIso: string): Array<{ uid: number; seen: boolean }> {
    const rows = this.db
      .prepare('SELECT uid, seen FROM mail_messages WHERE folder = ? AND date >= ?')
      .all(folder, sinceIso) as unknown as Array<{ uid: number; seen: number }>;
    return rows.map((row) => ({ uid: row.uid, seen: row.seen === 1 }));
  }

  setSeen(folder: string, uids: number[], seen: boolean): void {
    const statement = this.db.prepare(
      'UPDATE mail_messages SET seen = ? WHERE folder = ? AND uid = ?',
    );
    for (const uid of uids) statement.run(seen ? 1 : 0, folder, uid);
  }

  markRemoved(folder: string, sinceIso: string, presentUids: number[]): void {
    const present = new Set(presentUids);
    const now = new Date().toISOString();
    const mark = this.db.prepare(
      'UPDATE mail_messages SET removed_at = ? WHERE folder = ? AND uid = ? AND removed_at IS NULL',
    );
    const unmark = this.db.prepare(
      'UPDATE mail_messages SET removed_at = NULL WHERE folder = ? AND uid = ? AND removed_at IS NOT NULL',
    );
    for (const { uid } of this.knownUids(folder, sinceIso)) {
      if (present.has(uid)) unmark.run(folder, uid);
      else mark.run(now, folder, uid);
    }
  }

  unreadCount(): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM mail_messages
          WHERE seen = 0 AND outgoing = 0 AND removed_at IS NULL`,
      )
      .get() as { n: number };
    return row.n;
  }

  findMessage(id: string): MailMessage | null {
    const row = this.db.prepare('SELECT * FROM mail_messages WHERE id = ?').get(id) as
      MessageRow | undefined;
    return row ? toDomain(row) : null;
  }

  setMessageSummary(id: string, summary: string): void {
    this.db.prepare('UPDATE mail_messages SET ai_summary = ? WHERE id = ?').run(summary, id);
  }

  // --- Fils -------------------------------------------------------------------

  listThreads(filter: MailThreadFilter, me: string | null): MailThreadSummary[] {
    const where: string[] = [];
    const params: Array<string | number> = [];
    const view = filter.view ?? 'inbox';

    if (view === 'inbox') where.push('t.active_incoming > 0');
    if (view === 'unread') where.push('t.unread_count > 0');
    if (view === 'linked') where.push('(th.brand_id IS NOT NULL OR th.production_id IS NOT NULL)');
    if (filter.brandId) {
      where.push('th.brand_id = ?');
      params.push(filter.brandId);
    }
    if (filter.productionId) {
      where.push('th.production_id = ?');
      params.push(filter.productionId);
    }
    if (filter.search?.trim()) {
      const like = `%${filter.search.trim()}%`;
      where.push(
        `t.thread_id IN (SELECT thread_id FROM mail_messages
           WHERE subject LIKE ? OR from_name LIKE ? OR from_address LIKE ? OR text_body LIKE ?)`,
      );
      params.push(like, like, like, like);
    }

    const rows = this.db
      .prepare(
        `${THREAD_SQL} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY t.last_date DESC LIMIT ?`,
      )
      .all(...params, filter.limit ?? 200) as unknown as ThreadRow[];
    if (rows.length === 0) return [];

    const ids = rows.map((row) => row.thread_id);
    const messages = this.db
      .prepare(
        `SELECT * FROM mail_messages WHERE thread_id IN (${ids.map(() => '?').join(', ')})
          ORDER BY date`,
      )
      .all(...ids) as unknown as MessageRow[];
    const byThread = new Map<string, MailMessage[]>();
    for (const row of messages) {
      const list = byThread.get(row.thread_id) ?? [];
      list.push(toDomain(row));
      byThread.set(row.thread_id, list);
    }

    return rows.map((row) => this.summarize(row, byThread.get(row.thread_id) ?? [], me));
  }

  findThread(id: string, me: string | null): MailThreadView | null {
    const row = this.db.prepare(`${THREAD_SQL} WHERE t.thread_id = ?`).get(id) as
      ThreadRow | undefined;
    if (!row) return null;
    const messages = (
      this.db
        .prepare('SELECT * FROM mail_messages WHERE thread_id = ? ORDER BY date')
        .all(id) as unknown as MessageRow[]
    ).map(toDomain);
    // Une note supprimée depuis la fiche de la vidéo ne doit pas être réécrite : on la recrée.
    const noteExists =
      row.note_id !== null &&
      this.db.prepare('SELECT 1 FROM production_notes WHERE id = ?').get(row.note_id) !== undefined;
    return {
      ...this.summarize(row, messages, me),
      summary: row.summary,
      summaryAt: row.summary_at,
      noteId: noteExists ? row.note_id : null,
      messages,
    };
  }

  private summarize(row: ThreadRow, messages: MailMessage[], me: string | null): MailThreadSummary {
    const last = messages.at(-1);
    const mine = me?.toLowerCase() ?? null;
    const participants = new Map<string, MailAddress>();
    for (const message of messages) {
      const people = message.outgoing ? [...message.to, ...message.cc] : [message.from];
      for (const person of people) {
        const key = person.address.toLowerCase();
        if (!key || key === mine || participants.has(key)) continue;
        participants.set(key, person);
      }
    }
    return {
      id: row.thread_id,
      subject: messages[0]?.subject || last?.subject || '(sans objet)',
      participants: [...participants.values()],
      snippet: last?.snippet ?? '',
      lastDate: row.last_date,
      messageCount: row.message_count,
      unreadCount: row.unread_count,
      hasAttachments: row.has_attachments === 1,
      brandId: row.brand_id,
      brandName: row.brand_name,
      brandColor: row.brand_color,
      productionId: row.production_id,
      productionTitle: row.production_title,
      archived: row.active_incoming === 0,
    };
  }

  private ensureThread(id: string): void {
    const exists = this.db
      .prepare('SELECT 1 FROM mail_messages WHERE thread_id = ? LIMIT 1')
      .get(id);
    if (!exists) throw notFound('Fil');
    const now = new Date().toISOString();
    this.db
      .prepare('INSERT OR IGNORE INTO mail_threads (id, created_at, updated_at) VALUES (?, ?, ?)')
      .run(id, now, now);
  }

  linkThread(id: string, links: MailThreadLinks): void {
    this.ensureThread(id);
    const now = new Date().toISOString();
    if (links.brandId !== undefined) {
      this.db
        .prepare('UPDATE mail_threads SET brand_id = ?, updated_at = ? WHERE id = ?')
        .run(links.brandId, now, id);
    }
    if (links.productionId !== undefined) {
      this.db
        .prepare('UPDATE mail_threads SET production_id = ?, updated_at = ? WHERE id = ?')
        .run(links.productionId, now, id);
    }
  }

  setThreadSummary(id: string, summary: string): void {
    this.ensureThread(id);
    const now = new Date().toISOString();
    this.db
      .prepare('UPDATE mail_threads SET summary = ?, summary_at = ?, updated_at = ? WHERE id = ?')
      .run(summary, now, now, id);
  }

  setThreadNote(id: string, noteId: string | null): void {
    this.ensureThread(id);
    this.db
      .prepare('UPDATE mail_threads SET note_id = ?, updated_at = ? WHERE id = ?')
      .run(noteId, new Date().toISOString(), id);
  }
}
