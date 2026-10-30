import type {
  MailAddress,
  MailConnection,
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
import { DEFAULT_AI_MODEL } from '../../../domain/mail/entities/Mail.ts';
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
const AI_KEY_CONTEXT = 'mail:aiKey';

/** Ce que l'environnement fournit. Il l'emporte toujours sur l'écran. */
export interface MailEnv {
  password: string | null;
  anthropicApiKey: string | null;
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
 * Seul ce use case chiffre et déchiffre le mot de passe et la clé de l'IA, comme
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
  private syncing: Promise<MailSyncResult> | null = null;

  constructor(
    settings: MailSettingsRepository,
    store: MailStore,
    cipher: SecretCipher,
    env: MailEnv,
    servers: MailServerFactory,
    sender: MailSender,
  ) {
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
    const aiKeySource = this.secretSource(
      this.env.anthropicApiKey,
      stored.encryptedAiKey,
      AI_KEY_CONTEXT,
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
      syncDays: stored.syncDays,
      aiKeySource,
      aiModel: stored.aiModel ?? DEFAULT_AI_MODEL,
      secretsKeyConfigured: this.cipher.available,
      configured: this.connectionOf(stored) !== null,
      aiConfigured: aiKeySource === 'env' || aiKeySource === 'app',
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
    if (input.syncDays !== undefined) patch.syncDays = input.syncDays;
    if (input.aiModel !== undefined) patch.aiModel = text(input.aiModel);

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
    if (input.aiApiKey !== undefined) {
      if (this.env.anthropicApiKey) {
        throw conflict(
          'La clé de l’IA vient de ANTHROPIC_API_KEY : elle se change dans l’environnement.',
        );
      }
      patch.encryptedAiKey = input.aiApiKey
        ? this.cipher.encrypt(input.aiApiKey, AI_KEY_CONTEXT)
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

  /** Mon adresse, pour ne pas me compter parmi les interlocuteurs d'un fil. */
  me(): string | null {
    const stored = this.settings.get();
    return stored.fromAddress ?? stored.username;
  }

  /** Ce dont l'assistant a besoin. La clé ne sort de ce use case que vers lui. */
  aiContext(): {
    apiKey: string;
    model: string;
    fromName: string;
    signature: string;
    rates: string;
  } {
    const stored = this.settings.get();
    const apiKey =
      this.env.anthropicApiKey ??
      (stored.encryptedAiKey ? this.cipher.decrypt(stored.encryptedAiKey, AI_KEY_CONTEXT) : null);
    if (!apiKey) {
      throw badRequest('Aucune clé API Anthropic : renseigne-la dans Paramètres → Admin → Mails.');
    }
    return {
      apiKey,
      model: stored.aiModel ?? DEFAULT_AI_MODEL,
      fromName: stored.fromName,
      signature: stored.signature,
      rates: stored.rates,
    };
  }

  stats(): MailStats {
    const view = this.view();
    const stored = this.settings.get();
    return {
      configured: view.configured,
      aiConfigured: view.aiConfigured,
      unread: this.store.unreadCount(),
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
    try {
      server = await this.servers.open(connection);
      const since = new Date(Date.now() - this.settings.get().syncDays * DAY_MS);
      const sinceIso = since.toISOString();
      const known = new Map(this.store.folders().map((folder) => [folder.path, folder]));

      for (const folder of await server.resolveFolders()) {
        const state = known.get(folder.path);
        let result = await server.syncFolder(folder.path, state?.lastUid ?? 0, since);
        let lastUid = state?.lastUid ?? 0;
        if (state?.uidValidity && state.uidValidity !== result.uidValidity) {
          // Les UID d'avant ne désignent plus rien : on réimporte tout depuis zéro.
          this.store.resetFolder(folder.path);
          lastUid = 0;
          result = await server.syncFolder(folder.path, 0, since);
        }
        for (const message of result.fresh) {
          this.store.insert({ ...message, folder: folder.path, outgoing: folder.role === 'sent' });
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
    return this.store.listThreads(filter, this.me());
  }

  thread(id: string): MailThreadView {
    const thread = this.store.findThread(id, this.me());
    if (!thread) throw notFound('Fil');
    return thread;
  }

  link(id: string, links: MailThreadLinks): MailThreadView {
    this.store.linkThread(id, links);
    return this.thread(id);
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
  }): Promise<{ messageId: string; threadId: string | null }> {
    if (input.to.length === 0) throw badRequest('Au moins un destinataire.');
    const connection = this.connection();

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
