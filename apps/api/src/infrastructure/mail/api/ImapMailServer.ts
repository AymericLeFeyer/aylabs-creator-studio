import { ImapFlow } from 'imapflow';
import { simpleParser, type AddressObject } from 'mailparser';
import type {
  MailAddress,
  MailConnection,
  MailFolderRole,
} from '../../../domain/mail/entities/Mail.ts';
import type {
  FetchedMessage,
  MailServer,
  MailServerFactory,
} from '../../../domain/mail/repositories/MailRepository.ts';
import { bodyText, snippetOf } from '../../../domain/mail/services/threading.ts';
import { upstream } from '../../../shared/errors.ts';

/** Au-delà, on ne télécharge que l'enveloppe : une pièce jointe de 40 Mo n'a rien à faire en base. */
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
/** Une première collecte sur une boîte chargée : les plus récents d'abord, le reste au passage suivant. */
const MAX_FRESH_PER_PASS = 300;

const SENT_NAMES = [
  'sent',
  'sent items',
  'sent messages',
  'envoyés',
  'éléments envoyés',
  'messages envoyés',
];

const addresses = (value: AddressObject | AddressObject[] | undefined): MailAddress[] =>
  (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((group) => group.value)
    .filter((entry) => entry.address)
    .map((entry) => ({ name: entry.name ?? '', address: entry.address ?? '' }));

const normalizeId = (value: string): string => {
  const trimmed = value.trim();
  return trimmed.startsWith('<') ? trimmed : `<${trimmed}>`;
};

/**
 * Les pièces jointes qu'on montre : tout sauf les images collées dans le corps (inline
 * sans nom). **Le même filtre sert à l'import et au téléchargement** : la position d'une
 * pièce dans cette liste est ce qui permet de la retrouver plus tard dans le message.
 */
const visibleAttachments = <T extends { contentDisposition?: string; filename?: string }>(
  attachments: T[],
): T[] =>
  attachments.filter(
    (attachment) => attachment.contentDisposition !== 'inline' || attachment.filename,
  );

/** Décode une source brute. Un message sans `Message-ID` en reçoit un, stable, tiré de son UID. */
export const parseMessage = async (
  source: Buffer,
  fallback: { uid: number; seen: boolean; internalDate: string; folder: string },
): Promise<FetchedMessage> => {
  const parsed = await simpleParser(source, { skipImageLinks: true });
  const references = (
    Array.isArray(parsed.references)
      ? parsed.references
      : parsed.references
        ? [parsed.references]
        : []
  )
    .flatMap((entry) => entry.split(/\s+/))
    .filter(Boolean)
    .map(normalizeId);
  const html = typeof parsed.html === 'string' ? parsed.html : null;
  const text = parsed.text ?? '';
  return {
    uid: fallback.uid,
    messageId: parsed.messageId
      ? normalizeId(parsed.messageId)
      : `<${fallback.folder}-${fallback.uid}@local>`,
    inReplyTo: parsed.inReplyTo ? normalizeId(parsed.inReplyTo.split(/\s+/)[0]!) : null,
    references,
    from: addresses(parsed.from)[0] ?? { name: '', address: '' },
    to: addresses(parsed.to),
    cc: addresses(parsed.cc),
    subject: parsed.subject ?? '',
    date: (parsed.date ?? new Date(fallback.internalDate)).toISOString(),
    snippet: snippetOf(bodyText({ textBody: text, htmlBody: html })),
    textBody: text,
    htmlBody: html,
    attachments: visibleAttachments(parsed.attachments).map((attachment) => ({
      filename: attachment.filename ?? 'pièce jointe',
      contentType: attachment.contentType,
      size: attachment.size,
    })),
    seen: fallback.seen,
    deliveredTo: [
      ...new Set(
        parsed.headerLines
          .filter((header) => header.key === 'delivered-to' || header.key === 'x-original-to')
          .flatMap((header) => header.line.match(/[^\s<>:,;"]+@[^\s<>:,;"]+/g) ?? [])
          .map((address) => address.toLowerCase()),
      ),
    ],
  };
};

/**
 * Le serveur IMAP, par `imapflow` (JavaScript pur, rien à compiler).
 *
 * Une connexion par passage, refermée à la fin : une session IMAP laissée ouverte dans un
 * conteneur finit toujours coupée par le serveur au pire moment, et un passage toutes les
 * cinq minutes n'a pas besoin de mieux.
 *
 * **Une commande à la fois.** `imapflow` interdit d'émettre une commande pendant qu'une
 * itération `fetch` est en cours (elle attendrait la fin de l'itération, qui l'attend) :
 * on liste d'abord, on télécharge ensuite, message par message.
 */
class ImapMailServer implements MailServer {
  private readonly client: ImapFlow;

  constructor(client: ImapFlow) {
    this.client = client;
  }

  async resolveFolders(): Promise<Array<{ path: string; role: MailFolderRole }>> {
    const list = await this.client.list();
    const sent =
      list.find((entry) => entry.specialUse === '\\Sent') ??
      list.find((entry) => SENT_NAMES.includes(entry.name.toLowerCase()));
    return [
      { path: 'INBOX', role: 'inbox' },
      ...(sent ? [{ path: sent.path, role: 'sent' as const }] : []),
    ];
  }

  async syncFolder(path: string, afterUid: number, since: Date) {
    const lock = await this.client.getMailboxLock(path);
    try {
      const mailbox = this.client.mailbox;
      const uidValidity = mailbox ? String(mailbox.uidValidity) : '';
      const uids = (await this.client.search({ since }, { uid: true })) || [];

      const present: Array<{ uid: number; seen: boolean; size: number; internalDate: string }> = [];
      if (uids.length > 0) {
        for await (const message of this.client.fetch(
          uids,
          { uid: true, flags: true, size: true, internalDate: true },
          { uid: true },
        )) {
          present.push({
            uid: message.uid,
            seen: message.flags?.has('\\Seen') ?? false,
            size: message.size ?? 0,
            internalDate: new Date(message.internalDate ?? Date.now()).toISOString(),
          });
        }
      }

      const fresh: FetchedMessage[] = [];
      const toFetch = present
        .filter((entry) => entry.uid > afterUid)
        .sort((a, b) => b.uid - a.uid)
        .slice(0, MAX_FRESH_PER_PASS)
        .reverse();
      for (const entry of toFetch) {
        const fallback = { ...entry, folder: path };
        if (entry.size > MAX_SOURCE_BYTES) {
          const head = await this.client.fetchOne(
            String(entry.uid),
            { envelope: true },
            { uid: true },
          );
          fresh.push({
            ...(await parseMessage(Buffer.from(''), fallback)),
            subject: (head && head.envelope?.subject) || '(message trop volumineux)',
            textBody: 'Message trop volumineux pour être importé : ouvre-le dans ta messagerie.',
          });
          continue;
        }
        const message = await this.client.fetchOne(
          String(entry.uid),
          { source: true },
          { uid: true },
        );
        if (!message || !message.source) continue;
        fresh.push(await parseMessage(message.source, fallback));
      }

      return {
        uidValidity,
        fresh,
        present: present.map(({ uid, seen }) => ({ uid, seen })),
      };
    } finally {
      lock.release();
    }
  }

  async setSeen(path: string, uids: number[], seen: boolean): Promise<void> {
    if (uids.length === 0) return;
    const lock = await this.client.getMailboxLock(path);
    try {
      if (seen) await this.client.messageFlagsAdd(uids, ['\\Seen'], { uid: true });
      else await this.client.messageFlagsRemove(uids, ['\\Seen'], { uid: true });
    } finally {
      lock.release();
    }
  }

  async listFolders() {
    const list = await this.client.list();
    return list
      .filter((entry) => !entry.flags?.has('\\Noselect'))
      .map((entry) => ({
        path: entry.path,
        name: entry.name,
        specialUse: entry.specialUse ?? null,
      }))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  async move(path: string, uids: number[], target: string): Promise<void> {
    if (uids.length === 0) return;
    const lock = await this.client.getMailboxLock(path);
    try {
      await this.client.messageMove(uids, target, { uid: true });
    } finally {
      lock.release();
    }
  }

  async fetchAttachment(path: string, uid: number, position: number): Promise<Buffer | null> {
    const lock = await this.client.getMailboxLock(path);
    let source: Buffer | undefined;
    try {
      const message = await this.client.fetchOne(String(uid), { source: true }, { uid: true });
      source = message ? message.source : undefined;
    } finally {
      lock.release();
    }
    if (!source) return null;
    const parsed = await simpleParser(source);
    return visibleAttachments(parsed.attachments)[position]?.content ?? null;
  }

  async append(path: string, raw: Buffer): Promise<void> {
    await this.client.append(path, raw, ['\\Seen']);
  }

  async close(): Promise<void> {
    try {
      await this.client.logout();
    } catch {
      this.client.close();
    }
  }
}

export class ImapMailServerFactory implements MailServerFactory {
  async open(connection: MailConnection): Promise<MailServer> {
    const client = new ImapFlow({
      host: connection.imap.host,
      port: connection.imap.port,
      secure: connection.imap.secure,
      auth: { user: connection.username, pass: connection.password },
      // Proton Mail Bridge : certificat auto-signé, STARTTLS sur le port 143.
      ...(connection.allowSelfSigned ? { tls: { rejectUnauthorized: false } } : {}),
      logger: false,
    });
    // Sans écouteur, une coupure réseau en cours de session lèverait une erreur non
    // interceptée et ferait tomber toute l'API.
    client.on('error', (error: unknown) => console.warn('[mail] IMAP :', error));
    try {
      await client.connect();
    } catch (error) {
      throw upstream(
        `Connexion IMAP impossible (${connection.imap.host}:${connection.imap.port}) : ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    return new ImapMailServer(client);
  }
}
