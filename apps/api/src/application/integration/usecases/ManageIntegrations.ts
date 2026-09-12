import { createHash, randomBytes } from 'node:crypto';
import {
  PROVIDERS,
  providerDefinition,
  type CreatedExportKey,
  type CredentialFieldView,
  type ExportKey,
  type IntegrationProvider,
  type IntegrationsOverview,
  type IntegrationUpdateInput,
  type IntegrationView,
} from '../../../domain/integration/entities/Integration.ts';
import type {
  ExportKeyRepository,
  IntegrationRepository,
  LocalSourceRepository,
  SecretCipher,
} from '../../../domain/integration/repositories/IntegrationRepository.ts';
import { AppError, badRequest, conflict } from '../../../shared/errors.ts';
import { today } from '../../../shared/dates.ts';

export interface ResolvedCredentials {
  values: Record<string, string | null>;
  /** Libellés des champs obligatoires sans valeur. */
  missing: string[];
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

/**
 * Les réglages des sources de l'export, leurs identifiants, et les clés qui autorisent à
 * le lire.
 *
 * **Seul point où un secret est chiffré ou déchiffré.** Les routes ne voient que des
 * `IntegrationView`, où un secret se réduit à « d'où vient-il » (`source`) ; la valeur
 * en clair n'existe qu'entre `resolve()` et le collecteur qui s'en sert.
 *
 * **L'environnement l'emporte toujours.** Une variable définie (`AMAZON_PASSWORD`) masque
 * ce qui est enregistré, et l'écran refuse de modifier un champ qu'elle couvre : deux
 * valeurs pour le même champ, dont une invisible, finiraient par faire chercher
 * pourquoi la correction faite à l'écran « ne marche pas ».
 */
export class ManageIntegrations {
  private readonly repo: IntegrationRepository;
  private readonly keys: ExportKeyRepository;
  private readonly local: LocalSourceRepository;
  private readonly cipher: SecretCipher;
  private readonly env: Record<string, string | null>;

  constructor(
    repo: IntegrationRepository,
    keys: ExportKeyRepository,
    local: LocalSourceRepository,
    cipher: SecretCipher,
    env: Record<string, string | null>,
  ) {
    this.repo = repo;
    this.keys = keys;
    this.local = local;
    this.cipher = cipher;
    this.env = env;
  }

  overview(): IntegrationsOverview {
    return {
      secretsKeyConfigured: this.cipher.available,
      providers: PROVIDERS.map((provider) => this.view(provider.id)),
    };
  }

  view(provider: IntegrationProvider): IntegrationView {
    const definition = providerDefinition(provider);
    const base = {
      id: definition.id,
      label: definition.label,
      description: definition.description,
      kind: definition.kind,
      requiresBrowser: definition.requiresBrowser,
      enabled: this.repo.isEnabled(provider),
      fields: this.fieldViews(provider),
    };

    if (definition.kind === 'local') {
      const data = this.localData(provider);
      return {
        ...base,
        configured: data !== null,
        lastUpdate: data?.lastUpdate ?? null,
        lastAttemptAt: null,
        lastError: null,
        durationMs: null,
        data,
      };
    }

    const snapshot = this.repo.snapshot(provider);
    return {
      ...base,
      configured: this.resolve(provider).missing.length === 0,
      lastUpdate: snapshot?.fetchedAt ?? null,
      lastAttemptAt: snapshot?.lastAttemptAt ?? null,
      lastError: snapshot?.lastError ?? null,
      durationMs: snapshot?.durationMs ?? null,
      data: snapshot?.data ?? null,
    };
  }

  /** Ce qu'une source locale publie. `null` quand la base n'a rien à dire. */
  localData(provider: IntegrationProvider) {
    if (provider === 'youtube') return this.local.youtube(today());
    if (provider === 'instagram') return this.local.instagram();
    return null;
  }

  /** Les identifiants en clair, prêts pour un collecteur. Ne jamais les renvoyer à une route. */
  resolve(provider: IntegrationProvider): ResolvedCredentials {
    const definition = providerDefinition(provider);
    const stored = new Map(this.repo.storedCredentials(provider).map((row) => [row.key, row]));
    const values: Record<string, string | null> = {};
    const missing: string[] = [];

    for (const field of definition.fields) {
      const fromEnv = this.env[field.envVar] ?? null;
      const row = stored.get(field.key);
      const fromApp = row
        ? row.isSecret
          ? this.cipher.decrypt(row.value, `${provider}:${field.key}`)
          : row.value
        : null;
      const value = fromEnv ?? fromApp;
      values[field.key] = value;
      if (value === null && !field.optional) missing.push(field.label);
    }

    return { values, missing };
  }

  update(provider: IntegrationProvider, input: IntegrationUpdateInput): IntegrationView {
    const definition = providerDefinition(provider);
    const writes: Array<{ key: string; value: string | null; secret: boolean }> = [];

    // Tout est vérifié AVANT la première écriture : un formulaire à moitié enregistré
    // laisserait un mot de passe neuf à côté d'un identifiant d'avant.
    for (const [key, raw] of Object.entries(input.credentials ?? {})) {
      const field = definition.fields.find((candidate) => candidate.key === key);
      if (!field) throw badRequest(`Champ inconnu pour ${definition.label} : ${key}`);
      if (this.env[field.envVar]) {
        throw conflict(
          `« ${field.label} » est défini par ${field.envVar} dans l’environnement, qui l’emporte. Retire la variable pour le gérer depuis l’écran.`,
        );
      }
      // Un secret n'est pas « nettoyé » : un espace final peut faire partie d'un mot de passe.
      const value = field.secret ? raw || null : raw?.trim() || null;
      if (value !== null && field.secret && !this.cipher.available) {
        throw conflict(
          `SECRETS_KEY absente : « ${field.label} » ne peut pas être enregistré depuis l’écran sans être stocké en clair. Configure SECRETS_KEY, ou passe par ${field.envVar}.`,
        );
      }
      writes.push({ key, value, secret: field.secret });
    }

    for (const write of writes) {
      this.repo.setCredential(
        provider,
        write.key,
        write.value !== null && write.secret
          ? this.cipher.encrypt(write.value, `${provider}:${write.key}`)
          : write.value,
        write.secret,
      );
    }
    if (input.enabled !== undefined) this.repo.setEnabled(provider, input.enabled);

    return this.view(provider);
  }

  listKeys(): ExportKey[] {
    return this.keys.findAll();
  }

  /**
   * Crée une clé d'accès. Le jeton est renvoyé **cette fois-ci seulement** : la base n'en
   * garde que l'empreinte SHA-256. Un hachage lent n'apporterait rien ici — le jeton est
   * tiré au hasard sur 192 bits, il n'y a pas de dictionnaire à essayer.
   */
  createKey(label: string): CreatedExportKey {
    const token = `acs_${randomBytes(24).toString('base64url')}`;
    const key = this.keys.create(label, hashToken(token), token.slice(0, 8));
    return { key, token };
  }

  deleteKey(id: string): void {
    this.keys.delete(id);
  }

  /** Lève une 401 si le jeton ne correspond à aucune clé. */
  authenticate(token: string | null): void {
    if (this.keys.count() === 0) {
      throw new AppError(
        'Aucune clé d’accès : crée-en une dans Paramètres → API.',
        401,
        'UNAUTHORIZED',
      );
    }
    if (!token || !this.keys.touch(hashToken(token))) {
      throw new AppError('Clé d’accès invalide ou révoquée', 401, 'UNAUTHORIZED');
    }
  }

  private fieldViews(provider: IntegrationProvider): CredentialFieldView[] {
    const stored = new Map(this.repo.storedCredentials(provider).map((row) => [row.key, row]));

    return providerDefinition(provider).fields.map((field) => {
      const fromEnv = this.env[field.envVar] ?? null;
      const row = stored.get(field.key);
      const unreadable =
        !fromEnv &&
        row !== undefined &&
        row.isSecret &&
        this.cipher.decrypt(row.value, `${provider}:${field.key}`) === null;

      return {
        ...field,
        source: fromEnv ? 'env' : row ? 'app' : null,
        // Un identifiant non secret se relit ; celui de l'environnement aussi, pour qu'on
        // sache quel compte est branché sans ouvrir le serveur.
        value: field.secret ? null : (fromEnv ?? row?.value ?? null),
        unreadable,
      };
    });
  }
}
