import { createHash } from 'node:crypto';
import type { MailMessage } from '../entities/Mail.ts';

/**
 * L'identifiant d'un fil, tiré de l'en-tête qui l'a ouvert.
 *
 * IMAP ne connaît pas les fils (seul Gmail en expose un, hors norme) : on les reconstruit
 * comme tous les clients mail, par `References` / `In-Reply-To`. La racine est le premier
 * `References`, à défaut la réponse visée, à défaut le message lui-même. Haché pour tenir
 * dans une URL — un `Message-ID` porte chevrons, `@` et parfois des `/`.
 */
export const threadKey = (rootMessageId: string): string =>
  createHash('sha1').update(rootMessageId.trim().toLowerCase()).digest('hex').slice(0, 24);

export const rootOf = (message: {
  messageId: string;
  inReplyTo: string | null;
  references: string[];
}): string => message.references[0] ?? message.inReplyTo ?? message.messageId;

const QUOTE_HEADER =
  /^(?:On .{4,200}wrote:|Le .{4,200}a écrit\s?:|El .{4,200}escribió:|Am .{4,200}schrieb .{0,100}:|-{2,}\s*Original Message\s*-{2,}|-{2,}\s*Message d'origine\s*-{2,}|De\s?: .+\nEnvoyé\s?: )/im;

/**
 * Le texte **propre** d'un message : sans la citation de ce qui précède.
 *
 * Chaque réponse recopie tout le fil en dessous ; l'envoyer tel quel à l'IA ferait lire dix
 * fois le premier message d'une négociation, et les résumés en seraient faussés. On coupe à
 * la première ligne d'en-tête de citation connue (français, anglais, espagnol, allemand,
 * Outlook) et on retire les lignes en `>`.
 */
export const stripQuoted = (text: string): string => {
  const match = QUOTE_HEADER.exec(text);
  const head = match ? text.slice(0, match.index) : text;
  return head
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('>'))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

/** Un texte lisible à partir d'un HTML, sans dépendance : pour les mails sans partie texte. */
export const htmlToText = (html: string): string =>
  html
    .replace(/<(style|script|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();

export const bodyText = (message: Pick<MailMessage, 'textBody' | 'htmlBody'>): string =>
  message.textBody.trim() || (message.htmlBody ? htmlToText(message.htmlBody) : '');

export const snippetOf = (text: string): string =>
  stripQuoted(text).replace(/\s+/g, ' ').trim().slice(0, 200);

/** Au-delà, un message est tronqué pour l'IA — et elle le sait, la marque est explicite. */
const MAX_MESSAGE_CHARS = 12_000;

/**
 * Le fil mis à plat pour l'IA, du plus ancien au plus récent. Chaque message dit qui
 * parle, à qui, et quand : c'est ce qui permet de répondre « dans la langue du dernier
 * message reçu » et de savoir qui attend quoi de qui.
 */
export const transcriptOf = (messages: MailMessage[]): string =>
  messages
    .map((message, index) => {
      const body = stripQuoted(bodyText(message));
      const clipped =
        body.length > MAX_MESSAGE_CHARS
          ? `${body.slice(0, MAX_MESSAGE_CHARS)}\n[… message tronqué, ${body.length - MAX_MESSAGE_CHARS} caractères de plus]`
          : body;
      const from = message.from.name
        ? `${message.from.name} <${message.from.address}>`
        : message.from.address;
      const to = message.to.map((entry) => entry.address).join(', ');
      return [
        `### Message ${index + 1}${message.outgoing ? ' (envoyé par moi)' : ' (reçu)'}`,
        `De : ${from}`,
        `À : ${to}`,
        `Date : ${message.date}`,
        `Objet : ${message.subject}`,
        '',
        clipped || '(message vide)',
      ].join('\n');
    })
    .join('\n\n');

/** Les balises qu'une note de vidéo accepte. Tout le reste est retiré, attributs compris. */
const NOTE_TAGS = new Set(['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'br', 'blockquote']);

/**
 * Nettoie le HTML rendu par l'IA avant de l'écrire dans une note. TipTap filtrerait déjà
 * au chargement, mais la note est une donnée stockée : on n'y range rien qu'on ne sache
 * relire. Tout attribut part — pas d'`onclick`, pas de `style`, pas de lien.
 */
export const sanitizeNoteHtml = (html: string): string =>
  html
    .replace(/^```(?:html)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .replace(/<(script|style|iframe|object)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-z0-9]+)(\s[^>]*)?>/gi, (tag, name: string) => {
      const lower = name.toLowerCase();
      if (!NOTE_TAGS.has(lower)) return '';
      return tag.startsWith('</') ? `</${lower}>` : `<${lower}>`;
    })
    .trim();
