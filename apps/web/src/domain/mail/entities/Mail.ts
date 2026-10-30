/**
 * La boîte mail — contrat dupliqué de l'API (`apps/api/src/domain/mail/entities/Mail.ts`).
 *
 * **Aucun mail ne part sans un geste explicite** : l'envoi exige `confirm: true`, que seul
 * le bouton de la modale de confirmation pose. L'IA rend du texte, jamais un envoi.
 */

export interface MailAddress {
  name: string;
  address: string;
}

export interface MailAttachment {
  filename: string;
  contentType: string;
  size: number;
}

export interface MailMessage {
  id: string;
  folder: string;
  uid: number;
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  threadId: string;
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  date: string;
  snippet: string;
  textBody: string;
  htmlBody: string | null;
  attachments: MailAttachment[];
  seen: boolean;
  outgoing: boolean;
  aiSummary: string | null;
  removedAt: string | null;
}

export interface MailThreadSummary {
  id: string;
  subject: string;
  participants: MailAddress[];
  snippet: string;
  lastDate: string;
  messageCount: number;
  unreadCount: number;
  hasAttachments: boolean;
  brandId: string | null;
  brandName: string | null;
  brandColor: string | null;
  productionId: string | null;
  productionTitle: string | null;
  archived: boolean;
}

export interface MailThreadView extends MailThreadSummary {
  summary: string | null;
  summaryAt: string | null;
  noteId: string | null;
  messages: MailMessage[];
}

export type MailView = 'inbox' | 'unread' | 'linked' | 'all';

export const MAIL_VIEWS: Array<{ id: MailView; label: string }> = [
  { id: 'inbox', label: 'Réception' },
  { id: 'unread', label: 'Non lus' },
  { id: 'linked', label: 'Rattachés' },
  { id: 'all', label: 'Tous' },
];

export interface MailThreadFilter {
  search?: string;
  view?: MailView;
  brandId?: string;
  productionId?: string;
}

export type SecretSource = 'env' | 'app' | 'unreadable' | null;

export interface MailSettingsView {
  imapHost: string | null;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  allowSelfSigned: boolean;
  username: string | null;
  passwordSource: SecretSource;
  fromName: string;
  fromAddress: string | null;
  signature: string;
  rates: string;
  syncDays: number;
  aiKeySource: SecretSource;
  aiModel: string;
  secretsKeyConfigured: boolean;
  configured: boolean;
  aiConfigured: boolean;
}

export type MailSettingsInput = Partial<
  Omit<
    MailSettingsView,
    'passwordSource' | 'aiKeySource' | 'secretsKeyConfigured' | 'configured' | 'aiConfigured'
  >
> & {
  password?: string | null;
  aiApiKey?: string | null;
};

export interface MailStats {
  configured: boolean;
  aiConfigured: boolean;
  unread: number;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export type MailDraftIntent = 'not_interested' | 'interested' | 'rates';

export const MAIL_DRAFT_INTENTS: Array<{ id: MailDraftIntent; label: string }> = [
  { id: 'not_interested', label: 'Pas intéressé' },
  { id: 'interested', label: 'Intéressé' },
  { id: 'rates', label: 'Voici mes tarifs' },
];

export type MailAiRequest =
  | { action: 'summarize' }
  | { action: 'follow_up' }
  | { action: 'draft'; intent: MailDraftIntent; notes?: string }
  | { action: 'translate'; text: string; language?: string };

export interface SendMailInput {
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  text: string;
  threadId: string | null;
  /** Posé par la modale de confirmation, et par elle seule. */
  confirm: true;
}

/** Les modèles proposés dans les réglages. Un autre identifiant reste saisissable. */
export const AI_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 (recommandé)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (plus rapide, moins cher)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (le plus rapide)' },
];

export const addressLabel = (address: MailAddress): string => address.name || address.address;

/** « Re: » une seule fois, quel que soit le nombre d'allers-retours. */
export const replySubject = (subject: string): string =>
  /^(re|aw|rv|sv)\s*:/i.test(subject.trim()) ? subject.trim() : `Re: ${subject.trim()}`;

/** Parse « Nom <a@b.c>, d@e.f » en adresses. Les entrées sans `@` sont ignorées. */
export const parseAddresses = (value: string): MailAddress[] =>
  value
    .split(/[,;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = /^(.*)<([^>]+)>$/.exec(part);
      return match
        ? { name: match[1]!.trim().replace(/^"|"$/g, ''), address: match[2]!.trim() }
        : { name: '', address: part };
    })
    .filter((entry) => entry.address.includes('@'));

export const formatAddresses = (addresses: MailAddress[]): string =>
  addresses
    .map((entry) => (entry.name ? `${entry.name} <${entry.address}>` : entry.address))
    .join(', ');
