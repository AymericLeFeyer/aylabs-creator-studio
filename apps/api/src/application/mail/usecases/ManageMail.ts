import type {
  MailAddress,
  MailAddressCandidate,
  MailConnection,
  MailFolderInfo,
  MailScope,
  MailSettingsInput,
  MailSettingsView,
  MailStats,
  MailThreadFilter,
  MailThreadLinks,
  MailThreadSummary,
  MailThreadView,
  SecretSource,
  StoredMailSettings,
} from '../../../domain/mail/entities/Mail.ts';
import type {
  MailSender,
  MailServer,
  MailServerFactory,
  MailSettingsRepository,
  MailStore,
} from '../../../domain/mail/repositories/MailRepository.ts';
import type { SecretCipher } from '../../../domain/integration/repositories/IntegrationRepository.ts';
import { badRequest, conflict, notFound } from '../../../shared/errors.ts';

/** Données authentifiées des chiffrés : recopier l'un dans l'autre le rend illisible. */
const PASSWORD_CONTEXT = 'mail:password';

/** Ce que l'environnement fournit. Il l'emporte toujours sur l'écran. */
export interface MailEnv {
  password: string | null;
}

export interface MailSyncResult {
  created: number;
  error: string | null;
}

/**
 * Serveurs qui rangent eux-mêmes ce qui part par SMTP dans les envoyés : y ajouter une
 * copie la doublerait.
 */
const SAVES_SENT_ITSELF = /(gmail|googlemail|office365|outlook)\.com$/i;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * La boîte mail : réglages, collecte, fils, et **le seul chemin d'envoi**.
 *
 * Seul ce use case chiffre et déchiffre le mot de passe (la clé de l'IA vit dans
 * `ManageAi`, Paramètres → API), comme
 * `ManageIntegrations` pour les secrets de l'export. La connexion en clair n'existe que le
 * temps d'un appel et ne sort jamais d'ici.
 */
export class ManageMail {
  private readonly settings: MailSettingsRepository;
  private readonly store: MailStore;
  private readonly cipher: SecretCipher;
  private readonly env: MailEnv;
  private readonly servers: MailServerFactory;
  private readonly sender: MailSender;
  /** L'assistant est-il configuré ? Lu pour l'écran, jamais sa clé. */
  private readonly ai: { configured(): boolean };
  private syncing: Promise<MailSyncResult> | null = null;
  /**
   * Prévenu des fils qui ont reçu de nouveaux messages pendant un relevé : c'est ce qui
   * fait arriver une pièce jointe dans la note de la vidéo sans clic. Posé après coup
   * (`onThreadsChanged`) — le use case des notes dépend lui-même de celui-ci.
   */
  private threadsChanged: ((threadIds: string[]) => Promise<void>) | null = null;

  onThreadsChanged(listener: (threadIds: string[]) => Promise<void>): void {
    this.threadsChanged = listener;
  }

  constructor(
    settings: MailSettingsRepository,
    store: MailStore,
    cipher: SecretCipher,
    env: MailEnv,
    servers: MailServerFactory,
    sender: MailSender,
    ai: { configured(): boolean },
  ) {
    this.ai = ai;
    this.settings = settings;
    this.store = store;
    this.cipher = cipher;
    this.env = env;
    this.servers = servers;
    this.sender = sender;
  }

  // --- Réglages ---------------------------------------------------------------

  private secretSource(
    envValue: string | null,
    encrypted: string | null,
    context: string,
  ): SecretSource {
    if (envValue) return 'env';
    if (!encrypted) return null;
    return this.cipher.decrypt(encrypted, context) === null ? 'unreadable' : 'app';
  }

  view(): MailSettingsView {
    const stored = this.settings.get();
    const passwordSource = this.secretSource(
      this.env.password,
      stored.encryptedPassword,
      PASSWORD_CONTEXT,
    );
    return {
      imapHost: stored.imapHost,
      imapPort: stored.imapPort,
      imapSecure: stored.imapSecure,
      smtpHost: stored.smtpHost,
      smtpPort: stored.smtpPort,
      smtpSecure: stored.smtpSecure,
      allowSelfSigned: stored.allowSelfSigned,
      username: stored.username,
      passwordSource,
      fromName: stored.fromName,
      fromAddress: stored.fromAddress,
      signature: stored.signature,
      rates: stored.rates,
      addresses: stored.addresses,
      moveFolders: stored.moveFolders,
      senders: this.senders(stored),
      syncDays: stored.syncDays,
      secretsKeyConfigured: this.cipher.available,
      configured: this.connectionOf(stored) !== null,
      aiConfigured: this.ai.configured(),
    };
  }

  update(input: MailSettingsInput): MailSettingsView {
    const patch: Partial<StoredMailSettings> = {};
    const text = (value: string | null | undefined) =>
      value === undefined ? undefined : value?.trim() ? value.trim() : null;

    if (input.imapHost !== undefined) patch.imapHost = text(input.imapHost);
    if (input.imapPort !== undefined) patch.imapPort = input.imapPort;
    if (input.imapSecure !== undefined) patch.imapSecure = input.imapSecure;
    if (input.smtpHost !== undefined) patch.smtpHost = text(input.smtpHost);
    if (input.smtpPort !== undefined) patch.smtpPort = input.smtpPort;
    if (input.smtpSecure !== undefined) patch.smtpSecure = input.smtpSecure;
    if (input.allowSelfSigned !== undefined) patch.allowSelfSigned = input.allowSelfSigned;
    if (input.username !== undefined) patch.username = text(input.username);
    if (input.fromName !== undefined) patch.fromName = input.fromName.trim();
    if (input.fromAddress !== undefined) patch.fromAddress = text(input.fromAddress);
    if (input.signature !== undefined) patch.signature = input.signature;
    if (input.rates !== undefined) patch.rates = input.rates;
    if (input.addresses !== undefined) {
      patch.addresses = [
        ...new Set(input.addresses.map((address) => address.trim().toLowerCase())),
      ].filter(Boolean);
    }
    if (input.syncDays !== undefined) patch.syncDays = input.syncDays;
    if (input.moveFolders !== undefined) {
      patch.moveFolders = [...new Set(input.moveFolders.map((path) => path.trim()))].filter(
        Boolean,
      );
    }

    if (input.password !== undefined) {
      if (this.env.password) {
        throw conflict(
          'Le mot de passe vient de MAIL_PASSWORD : il se change dans l’environnement.',
        );
      }
      // Jamais de clair : sans SECRETS_KEY, `encrypt` refuse en 409.
      patch.encryptedPassword = input.password
        ? this.cipher.encrypt(input.password, PASSWORD_CONTEXT)
        : null;
    }
    this.settings.update(patch);
    return this.view();
  }

  /** La connexion en clair, ou `null` s'il manque quoi que ce soit. */
  private connectionOf(stored: StoredMailSettings): MailConnection | null {
    const password =
      this.env.password ??
      (stored.encryptedPassword
        ? this.cipher.decrypt(stored.encryptedPassword, PASSWORD_CONTEXT)
        : null);
    if (!stored.imapHost || !stored.smtpHost || !stored.username || !password) return null;
    return {
      imap: { host: stored.imapHost, port: stored.imapPort, secure: stored.imapSecure },
      smtp: { host: stored.smtpHost, port: stored.smtpPort, secure: stored.smtpSecure },
      allowSelfSigned: stored.allowSelfSigned,
      username: stored.username,
      password,
      fromName: stored.fromName,
      fromAddress: stored.fromAddress ?? stored.username,
    };
  }

  private connection(): MailConnection {
    const connection = this.connectionOf(this.settings.get());
    if (!connection) {
      throw badRequest('La boîte mail n’est pas configurée : Paramètres → Admin → Mails.');
    }
    return connection;
  }

  /** L'adresse d'expédition par défaut, puis les adresses suivies. */
  private senders(stored: StoredMailSettings): string[] {
    const main = (stored.fromAddress ?? stored.username)?.toLowerCase();
    return [...new Set([...(main ? [main] : []), ...stored.addresses])];
  }

  /** Le périmètre de la boîte : ce qui est suivi, et ce qui me désigne. */
  scope(): MailScope {
    const stored = this.settings.get();
    return {
      filter: stored.addresses,
      mine: [
        ...new Set([
          ...this.senders(stored),
          ...(stored.username ? [stored.username.toLowerCase()] : []),
        ]),
      ],
    };
  }

  /** Les adresses vues dans la boîte, pour cocher celles à suivre. */
  addressCandidates(): MailAddressCandidate[] {
    return this.store.addressCandidates();
  }

  /** Ce que l'assistant reprend pour écrire en mon nom : nom, signature, tarifs. */
  writingContext(): { fromName: string; signature: string; rates: string } {
    const stored = this.settings.get();
    return { fromName: stored.fromName, signature: stored.signature, rates: stored.rates };
  }

  stats(): MailStats {
    const view = this.view();
    const stored = this.settings.get();
    return {
      configured: view.configured,
      aiConfigured: view.aiConfigured,
      unread: this.store.unreadCount(this.scope()),
      lastSyncAt: stored.lastSyncAt,
      lastSyncError: stored.lastSyncError,
    };
  }

  /** Ouvre puis referme une session IMAP : le bouton « Tester » de l'écran de réglages. */
  async test(): Promise<{ folders: string[] }> {
    const server = await this.servers.open(this.connection());
    try {
      const folders = await server.resolveFolders();
      return {
        folders: folders.map(
          (folder) => `${folder.path} (${folder.role === 'inbox' ? 'réception' : 'envoyés'})`,
        ),
      };
    } finally {
      await server.close();
    }
  }

  // --- Collecte ---------------------------------------------------------------

  /**
   * Relève la boîte. Un seul passage à la fois : le cron et un clic se partagent la même
   * promesse plutôt que d'ouvrir deux sessions IMAP sur le même compte.
   */
  sync(): Promise<MailSyncResult> {
    if (!this.syncing) {
      this.syncing = this.runSync().finally(() => {
        this.syncing = null;
      });
    }
    return this.syncing;
  }

  private async runSync(): Promise<MailSyncResult> {
    const connection = this.connectionOf(this.settings.get());
    if (!connection) return { created: 0, error: null };

    let server: MailServer | null = null;
    let created = 0;
    const touched = new Set<string>();
    try {
      server = await this.servers.open(connection);
      const since = new Date(Date.now() - this.settings.get().syncDays * DAY_MS);
      const sinceIso = since.toISOString();
      const known = new Map(this.store.folders().map((folder) => [folder.path, folder]));

      // Réception d'abord : un mail rangé doit y être marqué parti avant d'être retrouvé
      // dans son dossier, c'est ce qui fait suivre sa ligne au lieu d'en créer une seconde.
      const stored = this.settings.get();
      const mine = this.scope().mine;
      const base = await server.resolveFolders();
      const followed = [
        ...base,
        ...stored.moveFolders
          .filter((path) => !base.some((folder) => folder.path === path))
          .map((path) => ({ path, role: 'folder' as const })),
      ];

      for (const folder of followed) {
        const state = known.get(folder.path);
        // Un dossier supprimé dans Proton ne doit pas priver du relevé de la réception.
        const first = await server
          .syncFolder(folder.path, state?.lastUid ?? 0, since)
          .catch((error: unknown) => {
            if (folder.role !== 'folder') throw error;
            console.warn(`[mail] dossier ${folder.path} :`, error);
            return null;
          });
        if (!first) continue;
        let result = first;
        let lastUid = state?.lastUid ?? 0;
        if (state?.uidValidity && state.uidValidity !== result.uidValidity) {
          // Les UID d'avant ne désignent plus rien : on réimporte tout depuis zéro.
          this.store.resetFolder(folder.path);
          lastUid = 0;
          result = await server.syncFolder(folder.path, 0, since);
        }
        for (const message of result.fresh) {
          const threadId = this.store.insert({
            ...message,
            folder: folder.path,
            // Dans un dossier, mes réponses côtoient les mails reçus.
            outgoing:
              folder.role === 'sent' ||
              (folder.role === 'folder' && mine.includes(message.from.address.toLowerCase())),
          });
          if (threadId && message.attachments.length > 0) touched.add(threadId);
          lastUid = Math.max(lastUid, message.uid);
          created += 1;
        }
        // Lu ailleurs (téléphone, webmail) : on suit le serveur.
        const local = new Map(
          this.store.knownUids(folder.path, sinceIso).map((entry) => [entry.uid, entry.seen]),
        );
        const nowSeen = result.present.filter(
          (entry) => local.has(entry.uid) && local.get(entry.uid) !== entry.seen,
        );
        this.store.setSeen(
          folder.path,
          nowSeen.filter((entry) => entry.seen).map((entry) => entry.uid),
          true,
        );
        this.store.setSeen(
          folder.path,
          nowSeen.filter((entry) => !entry.seen).map((entry) => entry.uid),
          false,
        );
        this.store.markRemoved(
          folder.path,
          sinceIso,
          result.present.map((entry) => entry.uid),
        );
        this.store.saveFolder({
          path: folder.path,
          role: folder.role,
          uidValidity: result.uidValidity,
          lastUid,
        });
      }
      this.settings.update({ lastSyncAt: new Date().toISOString(), lastSyncError: null });
      await server.close();
      server = null;
      // Après la fermeture : la mise à jour des notes rouvre une session pour télécharger.
      if (touched.size > 0 && this.threadsChanged) {
        try {
          await this.threadsChanged([...touched]);
        } catch (error) {
          console.warn('[mail] mise à jour des notes de vidéo :', error);
        }
      }
      return { created, error: null };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.settings.update({ lastSyncError: message });
      return { created, error: message };
    } finally {
      await server?.close();
    }
  }

  // --- Fils ---------------------------------------------------------------------

  listThreads(filter: MailThreadFilter): MailThreadSummary[] {
    return this.store.listThreads(filter, this.scope());
  }

  thread(id: string): MailThreadView {
    const thread = this.store.findThread(id, this.scope());
    if (!thread) throw notFound('Fil');
    return thread;
  }

  link(id: string, links: MailThreadLinks): MailThreadView {
    this.store.linkThread(id, links);
    return this.thread(id);
  }

  // --- Dossiers et pièces jointes -------------------------------------------------

  /** Les dossiers du compte, lus en direct : l'écran de réglages en coche quelques-uns. */
  async folders(): Promise<MailFolderInfo[]> {
    const server = await this.servers.open(this.connection());
    try {
      return await server.listFolders();
    } finally {
      await server.close();
    }
  }

  /**
   * Range un fil dans un dossier, **sur le serveur** : ses messages reçus quittent la
   * boîte de réception (`MOVE`), et sont marqués partis ici — le fil sort de « Réception »
   * mais reste lisible dans « Tous » et dans ses rattachements.
   *
   * Seuls les dossiers choisis dans les réglages sont admis. Les pièces jointes sont
   * **téléchargées avant** : une fois rangé, le message n'est plus relevé, et ses pièces
   * ne pourraient plus être relues.
   */
  async move(id: string, target: string): Promise<MailThreadView> {
    if (!this.settings.get().moveFolders.includes(target)) {
      throw badRequest(`« ${target} » n’est pas un dossier de rangement choisi dans les réglages.`);
    }
    const thread = this.thread(id);
    const inbox = this.store.folders().find((folder) => folder.role === 'inbox')?.path ?? 'INBOX';
    const messages = thread.messages.filter(
      (message) => message.folder === inbox && !message.removedAt,
    );
    if (messages.length === 0) return thread;

    const server = await this.servers.open(this.connection());
    try {
      await this.cacheAttachments(thread, server);
      await server.move(
        inbox,
        messages.map((message) => message.uid),
        target,
      );
    } finally {
      await server.close();
    }
    this.store.markMessagesRemoved(messages.map((message) => message.id));
    // Le relevé retrouve aussitôt le fil dans son dossier, s'il fait partie des suivis.
    await this.sync();
    return this.thread(id);
  }

  /**
   * Une pièce jointe, avec son contenu. Relue sur le serveur la première fois, puis gardée
   * en base : c'est ce qui permet aux liens posés dans une note de vidéo de fonctionner
   * encore quand le mail a été rangé ou supprimé.
   */
  async attachment(id: string): Promise<{ filename: string; contentType: string; data: Buffer }> {
    const stored = this.store.findAttachment(id);
    if (!stored) throw notFound('Pièce jointe');
    if (stored.data) {
      return { filename: stored.filename, contentType: stored.contentType, data: stored.data };
    }
    if (!stored.folder || stored.uid === null) {
      throw notFound('Pièce jointe (le message n’est plus sur le serveur)');
    }
    const server = await this.servers.open(this.connection());
    try {
      const data = await server.fetchAttachment(stored.folder, stored.uid, stored.position);
      if (!data) throw notFound('Pièce jointe (le message n’est plus sur le serveur)');
      this.store.saveAttachmentData(id, data);
      return { filename: stored.filename, contentType: stored.contentType, data };
    } finally {
      await server.close();
    }
  }

  /**
   * Télécharge en base toutes les pièces d'un fil qui ne le sont pas encore. Au mieux :
   * une pièce introuvable n'empêche ni la note ni le rangement. Une session déjà ouverte
   * peut être fournie (rangement), sinon une est ouverte pour l'occasion.
   */
  async cacheAttachments(thread: MailThreadView, open?: MailServer): Promise<void> {
    const pending = thread.messages.flatMap((message) =>
      message.attachments
        .map((attachment) => (attachment.id ? this.store.findAttachment(attachment.id) : null))
        .filter((stored) => stored && !stored.data && stored.folder && stored.uid !== null),
    );
    if (pending.length === 0) return;
    const server = open ?? (await this.servers.open(this.connection()));
    try {
      for (const stored of pending) {
        try {
          const data = await server.fetchAttachment(
            stored!.folder!,
            stored!.uid!,
            stored!.position,
          );
          if (data) this.store.saveAttachmentData(stored!.id, data);
        } catch (error) {
          console.warn(`[mail] pièce jointe ${stored!.filename} :`, error);
        }
      }
    } finally {
      if (!open) await server.close();
    }
  }

  /** Lu / non lu, **sur le serveur d'abord** : la boîte du téléphone doit dire la même chose. */
  async setRead(id: string, read: boolean): Promise<MailThreadView> {
    const thread = this.thread(id);
    const targets = read
      ? thread.messages.filter(
          (message) => !message.outgoing && !message.seen && !message.removedAt,
        )
      : thread.messages
          .filter((message) => !message.outgoing && message.seen && !message.removedAt)
          .slice(-1);
    if (targets.length === 0) return thread;

    const byFolder = new Map<string, number[]>();
    for (const message of targets) {
      byFolder.set(message.folder, [...(byFolder.get(message.folder) ?? []), message.uid]);
    }
    const server = await this.servers.open(this.connection());
    try {
      for (const [folder, uids] of byFolder) {
        await server.setSeen(folder, uids, read);
        this.store.setSeen(folder, uids, read);
      }
    } finally {
      await server.close();
    }
    return this.thread(id);
  }

  // --- Envoi --------------------------------------------------------------------

  /**
   * **Le seul chemin par lequel un mail quitte le studio.** Appelé par une seule route,
   * qui exige `confirm: true` dans le corps — le bouton de l'écran ne le pose qu'après la
   * confirmation explicite. L'assistant n'y a pas accès.
   *
   * En réponse dans un fil, `In-Reply-To` et `References` sont repris du dernier message :
   * c'est ce qui fait apparaître la réponse dans le même fil chez le destinataire.
   */
  async send(input: {
    to: MailAddress[];
    cc: MailAddress[];
    subject: string;
    text: string;
    threadId: string | null;
    /** `null` : l'adresse d'expédition par défaut. */
    from: string | null;
  }): Promise<{ messageId: string; threadId: string | null }> {
    if (input.to.length === 0) throw badRequest('Au moins un destinataire.');
    const connection = this.connection();
    const senders = this.senders(this.settings.get());
    const from = input.from ?? connection.fromAddress;
    // Seules mes adresses : le serveur refuserait de toute façon, autant le dire clairement.
    if (!senders.includes(from.toLowerCase())) {
      throw badRequest(`« ${from} » n’est pas une de tes adresses d’expédition.`);
    }

    let inReplyTo: string | null = null;
    let references: string[] = [];
    if (input.threadId) {
      const last = this.thread(input.threadId).messages.at(-1);
      if (last) {
        inReplyTo = last.messageId;
        references = [...last.references, last.messageId].slice(-20);
      }
    }

    const sent = await this.sender.send(connection, {
      from,
      to: input.to,
      cc: input.cc,
      subject: input.subject,
      text: input.text,
      inReplyTo,
      references,
    });

    // Le mail est parti : tout ce qui suit est du confort, et ne doit jamais faire croire
    // à un échec d'envoi (on renverrait le même mail).
    if (!SAVES_SENT_ITSELF.test(connection.smtp.host)) {
      try {
        const server = await this.servers.open(connection);
        try {
          const sentFolder = (await server.resolveFolders()).find(
            (folder) => folder.role === 'sent',
          );
          if (sentFolder) await server.append(sentFolder.path, sent.raw);
        } finally {
          await server.close();
        }
      } catch (error) {
        console.warn('[mail] copie dans les envoyés impossible :', error);
      }
    }
    await this.sync();
    return { messageId: sent.messageId, threadId: input.threadId };
  }
}
