import type {
  MailConnection,
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
  /** Insère et rattache au bon fil. Ignoré si `(folder, uid)` existe déjà. */
  insert(message: NewMailMessage): void;
  /** Les UID connus d'un dossier depuis une date (ISO), pour réconcilier lus et départs. */
  knownUids(folder: string, sinceIso: string): Array<{ uid: number; seen: boolean }>;
  setSeen(folder: string, uids: number[], seen: boolean): void;
  /** Ce qui n'est plus dans le dossier sur le serveur est marqué, et démarqué s'il revient. */
  markRemoved(folder: string, sinceIso: string, presentUids: number[]): void;
  unreadCount(): number;

  listThreads(filter: MailThreadFilter, me: string | null): MailThreadSummary[];
  findThread(id: string, me: string | null): MailThreadView | null;
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

/** L'assistant : du texte en entrée, du texte en sortie. Il n'envoie jamais rien. */
export interface MailAi {
  complete(input: {
    apiKey: string;
    model: string;
    system: string;
    prompt: string;
  }): Promise<string>;
}
