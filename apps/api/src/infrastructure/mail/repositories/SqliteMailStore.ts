import type { DatabaseSync } from 'node:sqlite';
import type {
  MailAddress,
  MailAddressCandidate,
  MailMessage,
  MailScope,
  StoredAttachment,
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
  recipients: string;
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
 * Le périmètre, en SQL : un message en fait partie s'il a été **envoyé depuis** une adresse
 * suivie, ou **reçu sur** l'une d'elles (`recipients`, entouré d'espaces : `instr` ne peut
 * pas confondre `a@x.fr` avec `ba@x.fr`). Sans adresse suivie, tout en fait partie.
 */
const scopeSql = (scope: MailScope): { sql: string; params: string[] } => {
  if (scope.filter.length === 0) return { sql: '1 = 1', params: [] };
  const marks = scope.filter.map(() => '?').join(', ');
  const received = scope.filter.map(() => "instr(recipients, ' ' || ? || ' ') > 0").join(' OR ');
  return {
    sql: `((outgoing = 1 AND lower(from_address) IN (${marks})) OR (outgoing = 0 AND (${received})))`,
    params: [...scope.filter, ...scope.filter],
  };
};

/**
 * Les agrégats d'un fil, calculés à la lecture et **bornés au périmètre** : un fil n'existe
 * que s'il a au moins un message sur une adresse suivie, et seuls ceux-là comptent dans ses
 * non lus. Rien n'est dénormalisé — changer les adresses suivies n'a rien à recalculer.
 * `active_incoming` dit si le fil est encore dans la boîte de réception sur le serveur.
 */
const threadSql = (scope: MailScope): { sql: string; params: string[] } => {
  const { sql, params } = scopeSql(scope);
  return {
    sql: `
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
       WHERE ${sql}
       GROUP BY thread_id
    ) t
    LEFT JOIN mail_threads th ON th.id = t.thread_id
    LEFT JOIN brands b ON b.id = th.brand_id
    LEFT JOIN productions p ON p.id = th.production_id
`,
    params,
  };
};

/** Les adresses auxquelles un message a été écrit, au format de la colonne `recipients`. */
const recipientsOf = (message: NewMailMessage): string =>
  ` ${[
    ...new Set(
      [...message.to, ...message.cc]
        .map((entry) => entry.address.toLowerCase())
        .concat(message.deliveredTo),
    ),
  ].join(' ')} `;

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

  insert(message: NewMailMessage): string | null {
    const exists = this.db
      .prepare('SELECT 1 FROM mail_messages WHERE folder = ? AND uid = ?')
      .get(message.folder, message.uid);
    if (exists) return null;

    const id = newId();
    const threadId = this.resolveThread(message);
    this.db
      .prepare(
        `INSERT INTO mail_messages (id, folder, uid, message_id, in_reply_to, refs, thread_id,
           from_name, from_address, to_json, cc_json, subject, date, snippet, text_body,
           html_body, attachments_json, seen, outgoing, recipients, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        message.folder,
        message.uid,
        message.messageId,
        message.inReplyTo,
        message.references.join(' '),
        threadId,
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
        recipientsOf(message),
        new Date().toISOString(),
      );
    const attach = this.db.prepare(
      `INSERT OR IGNORE INTO mail_attachments
         (id, message_id, position, filename, content_type, size, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    message.attachments.forEach((attachment, position) =>
      attach.run(
        newId(),
        id,
        position,
        attachment.filename,
        attachment.contentType,
        attachment.size,
        new Date().toISOString(),
      ),
    );
    return threadId;
  }

  findAttachment(id: string): StoredAttachment | null {
    const row = this.db
      .prepare(
        `SELECT a.*, m.folder, m.uid FROM mail_attachments a
           LEFT JOIN mail_messages m ON m.id = a.message_id AND m.removed_at IS NULL
          WHERE a.id = ?`,
      )
      .get(id) as
      | {
          id: string;
          message_id: string;
          position: number;
          filename: string;
          content_type: string;
          size: number;
          data: Uint8Array | null;
          folder: string | null;
          uid: number | null;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      messageId: row.message_id,
      position: row.position,
      filename: row.filename,
      contentType: row.content_type,
      size: row.size,
      data: row.data ? Buffer.from(row.data) : null,
      folder: row.folder,
      uid: row.uid,
    };
  }

  saveAttachmentData(id: string, data: Buffer): void {
    this.db.prepare('UPDATE mail_attachments SET data = ? WHERE id = ?').run(data, id);
  }

  markMessagesRemoved(ids: string[]): void {
    const statement = this.db.prepare(
      'UPDATE mail_messages SET removed_at = ? WHERE id = ? AND removed_at IS NULL',
    );
    const now = new Date().toISOString();
    for (const id of ids) statement.run(now, id);
  }

  threadNoteBody(id: string): string | null {
    const row = this.db.prepare('SELECT note_body FROM mail_threads WHERE id = ?').get(id) as
      { note_body: string | null } | undefined;
    return row?.note_body ?? null;
  }

  setThreadNoteBody(id: string, html: string): void {
    this.ensureThread(id);
    this.db
      .prepare('UPDATE mail_threads SET note_body = ?, updated_at = ? WHERE id = ?')
      .run(html, new Date().toISOString(), id);
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

  unreadCount(scope: MailScope): number {
    const { sql, params } = scopeSql(scope);
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM mail_messages
          WHERE seen = 0 AND outgoing = 0 AND removed_at IS NULL AND ${sql}`,
      )
      .get(...params) as { n: number };
    return row.n;
  }

  /**
   * Les adresses vues : celles auxquelles des messages ont été **reçus**, et celles depuis
   * lesquelles j'en ai **envoyé**. Les interlocuteurs en copie y figurent aussi, avec peu
   * de messages — c'est à l'écran qu'on coche les siennes.
   */
  addressCandidates(): MailAddressCandidate[] {
    const rows = this.db
      .prepare('SELECT recipients, outgoing, from_address FROM mail_messages')
      .all() as unknown as Array<{ recipients: string; outgoing: number; from_address: string }>;
    const counts = new Map<string, MailAddressCandidate>();
    const bump = (address: string, key: 'received' | 'sent') => {
      if (!address.includes('@')) return;
      const entry = counts.get(address) ?? { address, received: 0, sent: 0 };
      entry[key] += 1;
      counts.set(address, entry);
    };
    for (const row of rows) {
      if (row.outgoing === 1) bump(row.from_address.toLowerCase(), 'sent');
      else
        for (const address of row.recipients.split(' ').filter(Boolean)) bump(address, 'received');
    }
    return [...counts.values()]
      .sort((a, b) => b.received + b.sent - (a.received + a.sent))
      .slice(0, 60);
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

  listThreads(filter: MailThreadFilter, scope: MailScope): MailThreadSummary[] {
    const base = threadSql(scope);
    const where: string[] = [];
    const params: Array<string | number> = [...base.params];
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
        `${base.sql} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
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

    return rows.map((row) => this.summarize(row, byThread.get(row.thread_id) ?? [], scope));
  }

  findThread(id: string, scope: MailScope): MailThreadView | null {
    const base = threadSql(scope);
    const row = this.db.prepare(`${base.sql} WHERE t.thread_id = ?`).get(...base.params, id) as
      ThreadRow | undefined;
    if (!row) return null;
    const messages = (
      this.db
        .prepare('SELECT * FROM mail_messages WHERE thread_id = ? ORDER BY date')
        .all(id) as unknown as MessageRow[]
    ).map(toDomain);
    // Les identifiants des pièces jointes, pour les liens de téléchargement.
    const attachmentRows = this.db
      .prepare(
        `SELECT a.id, a.message_id, a.position FROM mail_attachments a
           JOIN mail_messages m ON m.id = a.message_id WHERE m.thread_id = ?`,
      )
      .all(id) as unknown as Array<{ id: string; message_id: string; position: number }>;
    for (const message of messages) {
      message.attachments = message.attachments.map((attachment, position) => ({
        ...attachment,
        id:
          attachmentRows.find((row) => row.message_id === message.id && row.position === position)
            ?.id ?? undefined,
      }));
    }
    const recipients = (
      this.db
        .prepare('SELECT recipients FROM mail_messages WHERE thread_id = ? ORDER BY date')
        .all(id) as unknown as Array<{ recipients: string }>
    ).map((entry) => entry.recipients);
    // Une note supprimée depuis la fiche de la vidéo ne doit pas être réécrite : on la recrée.
    const noteExists =
      row.note_id !== null &&
      this.db.prepare('SELECT 1 FROM production_notes WHERE id = ?').get(row.note_id) !== undefined;
    return {
      ...this.summarize(row, messages, scope),
      replyFrom: this.replyFrom(messages, recipients, scope),
      summary: row.summary,
      summaryAt: row.summary_at,
      noteId: noteExists ? row.note_id : null,
      messages,
    };
  }

  /**
   * L'adresse depuis laquelle répondre : la plus récente des miennes à laquelle le fil a été
   * écrit (ou depuis laquelle j'ai déjà répondu). Répondre depuis une autre trahirait l'alias
   * — la marque a écrit à « partenariats@ », elle doit recevoir de « partenariats@ ».
   */
  private replyFrom(
    messages: MailMessage[],
    recipients: string[],
    scope: MailScope,
  ): string | null {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]!;
      if (message.outgoing) {
        const from = message.from.address.toLowerCase();
        if (scope.mine.includes(from)) return from;
        continue;
      }
      const hit = scope.mine.find((address) => recipients[index]?.includes(` ${address} `));
      if (hit) return hit;
    }
    return null;
  }

  private summarize(row: ThreadRow, messages: MailMessage[], scope: MailScope): MailThreadSummary {
    const last = messages.at(-1);
    const mine = new Set(scope.mine);
    const participants = new Map<string, MailAddress>();
    for (const message of messages) {
      const people = message.outgoing ? [...message.to, ...message.cc] : [message.from];
      for (const person of people) {
        const key = person.address.toLowerCase();
        if (!key || mine.has(key) || participants.has(key)) continue;
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
