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
  /** Posé à la lecture d'un fil : c'est lui qui sert au téléchargement. */
  id?: string;
  filename: string;
  contentType: string;
  size: number;
}

/** Une pièce jointe telle que stockée. `data` n'est rempli qu'à la demande. */
export interface StoredAttachment {
  id: string;
  messageId: string;
  position: number;
  filename: string;
  contentType: string;
  size: number;
  data: Buffer | null;
  /** Où la relire sur le serveur tant qu'elle n'est pas en base. `null` : message disparu. */
  folder: string | null;
  uid: number | null;
}

/** Un dossier du serveur, proposé pour ranger les fils. */
export interface MailFolderInfo {
  path: string;
  name: string;
  specialUse: string | null;
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
export type NewMailMessage = Omit<MailMessage, 'id' | 'threadId' | 'aiSummary' | 'removedAt'> & {
  /**
   * Les adresses de livraison (`Delivered-To`, `X-Original-To`) : elles disent à laquelle
   * de mes adresses le message est arrivé, même en copie cachée ou via une liste.
   */
  deliveredTo: string[];
};

/**
 * Quelles adresses sont « moi ». `filter` : celles qu'on suit (vide = toutes) ; `mine` :
 * tout ce qui me désigne (suivies, adresse d'expédition, identifiant), pour ne jamais me
 * compter parmi les interlocuteurs d'un fil.
 */
export interface MailScope {
  filter: string[];
  mine: string[];
}

/** Une adresse vue dans la boîte, proposée dans les réglages. */
export interface MailAddressCandidate {
  address: string;
  /** Messages reçus à cette adresse. */
  received: number;
  /** Messages envoyés depuis elle. */
  sent: number;
}

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
  /** L'adresse depuis laquelle répondre : celle à laquelle le fil m'a été écrit. */
  replyFrom: string | null;
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
  /** Adresses suivies, en minuscules. Vide = toutes. */
  addresses: string[];
  /** Dossiers du serveur proposés pour ranger un fil. */
  moveFolders: string[];
  syncDays: number;
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
  addresses: string[];
  moveFolders: string[];
  /** Les adresses depuis lesquelles on peut envoyer : l'expédition par défaut, puis les suivies. */
  senders: string[];
  syncDays: number;
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
  addresses?: string[];
  moveFolders?: string[];
  syncDays?: number;
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
  /** L'adresse d'expédition, déjà vérifiée parmi les miennes. */
  from: string;
  to: MailAddress[];
  cc: MailAddress[];
  subject: string;
  text: string;
  inReplyTo: string | null;
  references: string[];
}

/** Les boutons de pré-remplissage d'une réponse. */
export type MailDraftIntent = 'not_interested' | 'interested' | 'rates';
export const MAIL_DRAFT_INTENTS: MailDraftIntent[] = ['not_interested', 'interested', 'rates'];

export type MailAiAction =
  | { action: 'summarize' }
  | { action: 'follow_up' }
  | { action: 'draft'; intent: MailDraftIntent; notes?: string }
  | { action: 'translate'; text: string; language?: string };

/** Une tâche tirée d'une échéance d'un fil, et ce qu'il en est advenu. */
export interface MailDateTask {
  title: string;
  dueDate: string;
  /** `deadline` : l'échéance elle-même ; `start` : « s'y mettre », posée avant quand c'est urgent. */
  kind: 'deadline' | 'start';
  urgent: boolean;
  /** `exists` : déjà posée par une vérification précédente (jamais reposée, même supprimée). */
  status: 'created' | 'exists' | 'past' | 'not_connected' | 'error';
  error: string | null;
  quote: string;
}

export interface MailDateIncoherence {
  message: string;
  /** Le champ de la vidéo rattachée qui la résoudrait, avec la date proposée. */
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
