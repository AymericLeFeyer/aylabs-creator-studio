/**
 * La boîte mail dans le studio.
 *
 * Trois natures de données, et une règle qui ne se discute pas :
 *
 * - les **messages** sont une copie locale des dossiers suivis (réception et envoyés) —
 *   le serveur IMAP reste la source de vérité de leur contenu et de leur état lu ;
 * - les **fils** (`MailThread`) ne portent que ce qui appartient au studio : la marque, la
 *   vidéo, le résumé de l'IA, la note posée dans la fiche de la vidéo ;
 * - les **réglages** portent la connexion, la signature et les tarifs.
 *
 * **Aucun mail ne part sans un geste explicite.** L'envoi n'a qu'un chemin
 * (`POST /api/mails/send`, `confirm: true` obligatoire), et l'IA n'a accès à aucun : elle
 * rend du texte, que l'écran pose dans le brouillon.
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

export type MailFolderRole = 'inbox' | 'sent';

export interface MailMessage {
  id: string;
  folder: string;
  uid: number;
  /** L'en-tête `Message-ID`, chevrons compris. Sert au fil et aux réponses. */
  messageId: string;
  inReplyTo: string | null;
  references: string[];
  threadId: string;
  from: MailAddress;
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  /** Instant ISO (UTC). */
  date: string;
  snippet: string;
  textBody: string;
  htmlBody: string | null;
  attachments: MailAttachment[];
  seen: boolean;
  /** Vient du dossier des envoyés : c'est moi qui l'ai écrit. */
  outgoing: boolean;
  aiSummary: string | null;
  /** A quitté son dossier sur le serveur (archivé, supprimé ailleurs). Jamais effacé ici. */
  removedAt: string | null;
}

/** Ce que la collecte écrit. L'identifiant et le fil sont posés par le dépôt. */
export type NewMailMessage = Omit<MailMessage, 'id' | 'threadId' | 'aiSummary' | 'removedAt'>;

/** Une ligne de la liste des fils. */
export interface MailThreadSummary {
  id: string;
  subject: string;
  /** Les interlocuteurs, sans moi. */
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
  /** Tous les messages ont quitté la boîte de réception sur le serveur. */
  archived: boolean;
}

export interface MailThreadView extends MailThreadSummary {
  summary: string | null;
  summaryAt: string | null;
  /** La note posée dans la fiche de la vidéo, quand elle existe encore. */
  noteId: string | null;
  messages: MailMessage[];
}

export interface MailThreadFilter {
  search?: string;
  view?: 'inbox' | 'unread' | 'linked' | 'all';
  brandId?: string;
  productionId?: string;
  limit?: number;
}

export interface MailThreadLinks {
  brandId?: string | null;
  productionId?: string | null;
}

/** Ce qui est stocké. Les secrets sont **chiffrés** : seul `ManageMail` les lit en clair. */
export interface StoredMailSettings {
  imapHost: string | null;
  imapPort: number;
  imapSecure: boolean;
  smtpHost: string | null;
  smtpPort: number;
  smtpSecure: boolean;
  allowSelfSigned: boolean;
  username: string | null;
  encryptedPassword: string | null;
  fromName: string;
  fromAddress: string | null;
  signature: string;
  rates: string;
  syncDays: number;
  encryptedAiKey: string | null;
  aiModel: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

export type SecretSource = 'env' | 'app' | 'unreadable' | null;

/** Ce qui sort de l'API : jamais un secret, seulement d'où il vient. */
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

export interface MailSettingsInput {
  imapHost?: string | null;
  imapPort?: number;
  imapSecure?: boolean;
  smtpHost?: string | null;
  smtpPort?: number;
  smtpSecure?: boolean;
  allowSelfSigned?: boolean;
  username?: string | null;
  /** Absent = conservé, `null` ou `""` = effacé. */
  password?: string | null;
  fromName?: string;
  fromAddress?: string | null;
  signature?: string;
  rates?: string;
  syncDays?: number;
  aiApiKey?: string | null;
  aiModel?: string | null;
}

export interface MailStats {
  configured: boolean;
  aiConfigured: boolean;
  unread: number;
  lastSyncAt: string | null;
  lastSyncError: string | null;
}

/** La connexion en clair, le temps d'un appel. Ne sort jamais du use case. */
export interface MailConnection {
  imap: { host: string; port: number; secure: boolean };
  smtp: { host: string; port: number; secure: boolean };
  /**
   * Accepte un certificat auto-signé (Proton Mail Bridge). Le chiffrement reste actif,
   * seule la vérification de l'émetteur saute — acceptable sur le réseau Docker interne.
   */
  allowSelfSigned: boolean;
  username: string;
  password: string;
  fromName: string;
  fromAddress: string;
}

export interface OutgoingMail {
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  text: string;
  inReplyTo: string | null;
  references: string[];
}

export const DEFAULT_AI_MODEL = 'claude-opus-5';

/** Les boutons de pré-remplissage d'une réponse. */
export type MailDraftIntent = 'not_interested' | 'interested' | 'rates';
export const MAIL_DRAFT_INTENTS: MailDraftIntent[] = ['not_interested', 'interested', 'rates'];

export type MailAiAction =
  | { action: 'summarize' }
  | { action: 'follow_up' }
  | { action: 'draft'; intent: MailDraftIntent; notes?: string }
  | { action: 'translate'; text: string; language?: string };
