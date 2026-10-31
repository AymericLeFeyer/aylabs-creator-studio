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
  /** Présent à la lecture d'un fil : sert au téléchargement. */
  id?: string;
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
  /** L'adresse depuis laquelle répondre : celle à laquelle le fil m'a été écrit. */
  replyFrom: string | null;
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
  /** Ne garde que les fils présents dans ce dossier du serveur. */
  folder?: string;
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
  /** Adresses suivies (vide = toutes). */
  addresses: string[];
  /** Dossiers du serveur proposés par « Ranger dans… ». */
  moveFolders: string[];
  /** Adresses d'expédition possibles : la principale, puis les suivies. */
  senders: string[];
  syncDays: number;
  secretsKeyConfigured: boolean;
  configured: boolean;
  aiConfigured: boolean;
}

export type MailSettingsInput = Partial<
  Omit<
    MailSettingsView,
    'passwordSource' | 'secretsKeyConfigured' | 'configured' | 'aiConfigured' | 'senders'
  >
> & {
  password?: string | null;
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
  | { action: 'translate'; text: string; language?: string }
  | { action: 'refine'; text: string; instruction: string };

export interface SendMailInput {
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  text: string;
  threadId: string | null;
  /** Absente : l'adresse d'expédition par défaut. */
  from?: string;
  /** Le brouillon préparé par le MCP dont vient ce message : retiré après l'envoi. */
  draftId?: string;
  /** Posé par la modale de confirmation, et par elle seule. */
  confirm: true;
}

/** Une réponse préparée par le MCP, reprise dans le composeur par son lien. */
export interface PreparedMailDraft {
  id: string;
  threadId: string;
  from: string | null;
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  body: string;
  signature: string;
  createdAt: string;
}

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

/** Une adresse vue dans la boîte, proposée dans les réglages. */
export interface MailAddressCandidate {
  address: string;
  received: number;
  sent: number;
}

/** « Vérifier les dates » : une tâche tirée d'une échéance, et ce qu'il en est advenu. */
export interface MailDateTask {
  title: string;
  dueDate: string;
  kind: 'deadline' | 'start';
  urgent: boolean;
  status: 'created' | 'exists' | 'past' | 'not_connected' | 'error';
  error: string | null;
  quote: string;
}

export interface MailDateIncoherence {
  message: string;
  field: 'plannedDate' | 'startDate' | null;
  suggestedDate: string | null;
}

export interface MailDateCheck {
  summary: string;
  urgent: boolean;
  todoConnected: boolean;
  productionId: string | null;
  tasks: MailDateTask[];
  incoherences: MailDateIncoherence[];
}

/** Un dossier du serveur (Proton : `Folders/…`, `Labels/…`). */
export interface MailFolderInfo {
  path: string;
  name: string;
  specialUse: string | null;
}

/**
 * L'adresse de téléchargement d'une pièce jointe. Relative : nginx (prod) et Vite (dev)
 * servent `/api` sur la même origine que le front — c'est aussi ce qui la rend valable
 * dans une note de vidéo.
 */
export const attachmentUrl = (id: string): string => `/api/mails/attachments/${id}`;

/** Le dernier segment d'un chemin de dossier (« Folders/Partenariats » → « Partenariats »). */
export const folderLabel = (path: string): string =>
  path.split(/[/.]/).filter(Boolean).at(-1) ?? path;
