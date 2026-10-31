import type {
  MailAddressCandidate,
  MailConnection,
  MailDraft,
  MailFolderInfo,
  StoredAttachment,
  MailScope,
  MailFolderRole,
  MailMessage,
  MailThreadFilter,
  MailThreadLinks,
  MailThreadSummary,
  MailThreadView,
  NewMailMessage,
  OutgoingMail,
  StoredMailSettings,
} from '../entities/Mail.ts';

export interface MailSettingsRepository {
  get(): StoredMailSettings;
  update(patch: Partial<StoredMailSettings>): void;
}

export interface MailFolderState {
  path: string;
  role: MailFolderRole;
  uidValidity: string | null;
  lastUid: number;
}

export interface MailStore {
  folders(): MailFolderState[];
  saveFolder(state: MailFolderState): void;
  /** UIDVALIDITY a changé : les UID d'avant ne désignent plus rien, on repart de zéro. */
  resetFolder(path: string): void;
  /** Insère et rattache au bon fil. Rend le fil, ou `null` si `(folder, uid)` existait déjà. */
  insert(message: NewMailMessage): string | null;
  findAttachment(id: string): StoredAttachment | null;
  saveAttachmentData(id: string, data: Buffer): void;
  /** Les messages rangés ailleurs depuis le studio quittent la boîte de réception. */
  markMessagesRemoved(ids: string[]): void;
  threadNoteBody(id: string): string | null;
  setThreadNoteBody(id: string, html: string): void;
  /** Les UID connus d'un dossier depuis une date (ISO), pour réconcilier lus et départs. */
  knownUids(folder: string, sinceIso: string): Array<{ uid: number; seen: boolean }>;
  setSeen(folder: string, uids: number[], seen: boolean): void;
  /** Ce qui n'est plus dans le dossier sur le serveur est marqué, et démarqué s'il revient. */
  markRemoved(folder: string, sinceIso: string, presentUids: number[]): void;
  unreadCount(scope: MailScope): number;
  /** Les adresses vues dans la boîte, pour proposer le filtre. */
  addressCandidates(): MailAddressCandidate[];

  /** Seuls les fils qui ont au moins un message dans le périmètre (`scope.filter`). */
  listThreads(filter: MailThreadFilter, scope: MailScope): MailThreadSummary[];
  findThread(id: string, scope: MailScope): MailThreadView | null;
  findMessage(id: string): MailMessage | null;
  setMessageSummary(id: string, summary: string): void;
  linkThread(id: string, links: MailThreadLinks): void;
  setThreadSummary(id: string, summary: string): void;
  setThreadNote(id: string, noteId: string | null): void;
}

/** Un message lu sur le serveur et déjà décodé. Le dossier et le sens sont posés par la collecte. */
export type FetchedMessage = Omit<NewMailMessage, 'folder' | 'outgoing'>;

/** Ce que le serveur IMAP sait faire pour nous. */
export interface MailServer {
  /** Les dossiers suivis, retrouvés par leur rôle (`\\Sent`). */
  resolveFolders(): Promise<Array<{ path: string; role: MailFolderRole }>>;
  /**
   * Ouvre un dossier et rend son état, les nouveaux messages (UID > `afterUid`, bornés à
   * `since`) et l'état lu de tout ce qui est présent depuis `since`.
   */
  syncFolder(
    path: string,
    afterUid: number,
    since: Date,
  ): Promise<{
    uidValidity: string;
    fresh: FetchedMessage[];
    present: Array<{ uid: number; seen: boolean }>;
  }>;
  setSeen(path: string, uids: number[], seen: boolean): Promise<void>;
  /** Tous les dossiers du compte (Proton : `Folders/…`, `Labels/…`). */
  listFolders(): Promise<MailFolderInfo[]>;
  move(path: string, uids: number[], target: string): Promise<void>;
  /** Le contenu d'une pièce jointe, relu depuis le message. `null` s'il n'existe plus. */
  fetchAttachment(path: string, uid: number, position: number): Promise<Buffer | null>;
  append(path: string, raw: Buffer): Promise<void>;
  close(): Promise<void>;
}

export interface MailSender {
  /** Rend le message brut tel qu'envoyé, pour le ranger dans les envoyés. */
  send(connection: MailConnection, mail: OutgoingMail): Promise<{ raw: Buffer; messageId: string }>;
}

export interface MailServerFactory {
  open(connection: MailConnection): Promise<MailServer>;
}

export interface MailDraftRepository {
  create(draft: Omit<MailDraft, 'id' | 'createdAt'>, tokenHash: string): MailDraft;
  find(id: string): MailDraft | null;
  /** Le brouillon si ce jeton est le sien. */
  findByToken(id: string, tokenHash: string): MailDraft | null;
  /** Réserve l'envoi. `false` si un autre clic l'a déjà pris. */
  claim(id: string): boolean;
  release(id: string): void;
  delete(id: string): void;
  deleteOlderThan(iso: string): void;
}
