import type {
  AiCredentials,
  AiCreditView,
  AiKeySource,
  AiProvider,
  AiProviderView,
  AiSpendView,
  AiSettingsInput,
  AiSettingsView,
  AiTask,
  StoredAiSettings,
} from '../../../domain/ai/entities/Ai.ts';
import {
  AI_CREDIT_ALERT_CENTS,
  AI_PROVIDER_SETTINGS,
  AI_PROVIDERS,
  AI_TASKS,
} from '../../../domain/ai/entities/Ai.ts';
import type {
  AiCostClient,
  AiObserver,
  AiSettingsRepository,
} from '../../../domain/ai/repositories/AiRepository.ts';
import { usageCostMicros } from '../../../domain/ai/services/pricing.ts';
import type { SecretCipher } from '../../../domain/integration/repositories/IntegrationRepository.ts';
import { badRequest, conflict } from '../../../shared/errors.ts';

const ADMIN_KEY_CONTEXT = 'ai:openaiAdminKey';
const SPEND_CACHE_MS = 5 * 60_000;

const KEY_CONTEXT = { anthropic: 'ai:apiKey', openai: 'ai:openaiKey' };
/**
 * La clé vivait dans les réglages mail, chiffrée sous ce contexte. La migration 53 l'a
 * recopiée telle quelle (un chiffré ne se réécrit pas en SQL) : elle se relit sous l'ancien
 * contexte, puis se rechiffre sous le nouveau à la première lecture.
 */
const LEGACY_KEY_CONTEXT = 'mail:aiKey';

const MICROS_PER_CENT = 10_000;

/**
 * Les réglages de l'assistant IA, et le **seul** endroit où ses clés sont déchiffrées.
 *
 * Deux fournisseurs, chacun avec sa clé, son modèle et son solde. Un fournisseur par défaut,
 * et pour chaque tâche (`AI_TASKS`) un choix facultatif. La clé d'environnement d'un
 * fournisseur l'emporte sur l'écran.
 *
 * **Une seule clé OpenAI pour le texte et les images.** À défaut de sa propre clé, l'assistant
 * réutilise celle des miniatures (`sharedOpenAiKey`) : on ne la saisit qu'une fois.
 */
export class ManageAi {
  private readonly settings: AiSettingsRepository;
  private readonly cipher: SecretCipher;
  private readonly envKeys: Record<AiProvider, string | null>;

  private readonly sharedOpenAiKey: () => string | null;
  private readonly adminKeyEnv: string | null;
  private readonly costs: AiCostClient | null;
  private spendCache: { at: number; since: string; view: AiSpendView } | null = null;

  constructor(
    settings: AiSettingsRepository,
    cipher: SecretCipher,
    envKeys: Record<AiProvider, string | null>,
    options: {
      /** La clé OpenAI des miniatures, réutilisée à défaut de celle de l'assistant. */
      sharedOpenAiKey?: () => string | null;
      /** `OPENAI_ADMIN_KEY` : lit la dépense réelle d'OpenAI. */
      adminKeyEnv?: string | null;
      costs?: AiCostClient;
    } = {},
  ) {
    this.settings = settings;
    this.cipher = cipher;
    this.envKeys = envKeys;
    this.sharedOpenAiKey = options.sharedOpenAiKey ?? (() => null);
    this.adminKeyEnv = options.adminKeyEnv ?? null;
    this.costs = options.costs ?? null;
  }

  private storedAdminKey(): string | null {
    const { encryptedAdminKey } = this.settings.get('openai');
    return encryptedAdminKey ? this.cipher.decrypt(encryptedAdminKey, ADMIN_KEY_CONTEXT) : null;
  }

  private adminKeySource(provider: AiProvider): AiKeySource {
    if (provider !== 'openai') return null;
    if (this.adminKeyEnv) return 'env';
    if (!this.settings.get('openai').encryptedAdminKey) return null;
    return this.storedAdminKey() === null ? 'unreadable' : 'app';
  }

  /** OpenAI est-il activé ? Les miniatures s'y plient : même fournisseur, même interrupteur. */
  openAiEnabled(): boolean {
    return this.settings.get('openai').enabled;
  }

  /**
   * La clé OpenAI **propre** à l'assistant (environnement ou écran), sans repli : c'est ce
   * que les miniatures lui empruntent, et un repli dans les deux sens bouclerait.
   */
  ownOpenAiKey(): string | null {
    return (
      this.envKeys.openai ?? this.storedKey('openai', this.settings.get('openai').encryptedApiKey)
    );
  }

  private storedKey(provider: AiProvider, encryptedApiKey: string | null): string | null {
    if (!encryptedApiKey) return null;
    const current = this.cipher.decrypt(encryptedApiKey, KEY_CONTEXT[provider]);
    if (current !== null || provider !== 'anthropic') return current;
    const legacy = this.cipher.decrypt(encryptedApiKey, LEGACY_KEY_CONTEXT);
    if (legacy !== null && this.cipher.available) {
      this.settings.update(provider, {
        encryptedApiKey: this.cipher.encrypt(legacy, KEY_CONTEXT[provider]),
      });
    }
    return legacy;
  }

  private keySource(provider: AiProvider, encryptedApiKey: string | null): AiKeySource {
    if (this.envKeys[provider]) return 'env';
    if (encryptedApiKey)
      return this.storedKey(provider, encryptedApiKey) === null ? 'unreadable' : 'app';
    return provider === 'openai' && this.sharedOpenAiKey() ? 'shared' : null;
  }

  private apiKeyOf(provider: AiProvider): string | null {
    const own =
      this.envKeys[provider] ??
      this.storedKey(provider, this.settings.get(provider).encryptedApiKey);
    return own ?? (provider === 'openai' ? this.sharedOpenAiKey() : null);
  }

  private providerView(provider: AiProvider): AiProviderView {
    const settings = this.settings.get(provider);
    const keySource = this.keySource(provider, settings.encryptedApiKey);
    return {
      provider,
      label: AI_PROVIDER_SETTINGS[provider].label,
      envKey: AI_PROVIDER_SETTINGS[provider].envKey,
      keySource,
      model: settings.model ?? AI_PROVIDER_SETTINGS[provider].model,
      enabled: settings.enabled,
      configured: this.hasKey(provider),
      credit: this.credit(settings),
      adminKeySource: this.adminKeySource(provider),
    };
  }

  private hasKey(provider: AiProvider): boolean {
    const source = this.keySource(provider, this.settings.get(provider).encryptedApiKey);
    return source === 'env' || source === 'app' || source === 'shared';
  }

  /** Utilisable : activé **et** muni d'une clé. Un fournisseur désactivé n'est répondant nulle part. */
  private ready(provider: AiProvider): boolean {
    return this.settings.get(provider).enabled && this.hasKey(provider);
  }

  /**
   * Le fournisseur qui répond à une tâche : son choix s'il est prêt, sinon le défaut, sinon
   * n'importe lequel qui l'est, sinon `null`. Un choix dont la clé a disparu, ou qu'on a
   * désactivé, ne doit pas couper la tâche.
   */
  private resolve(task: AiTask | undefined): AiProvider | null {
    const fallback = this.settings.activeProvider();
    const chosen = task ? this.settings.routes()[task] : undefined;
    return (
      [chosen, fallback, ...AI_PROVIDERS].find(
        (provider): provider is AiProvider => !!provider && this.ready(provider),
      ) ?? null
    );
  }

  view(): AiSettingsView {
    const defaultProvider = this.settings.activeProvider();
    const routes = this.settings.routes();
    const providers = AI_PROVIDERS.map((provider) => this.providerView(provider));
    const ready = providers.filter((entry) => entry.enabled && entry.configured);
    const byId = (provider: AiProvider) => providers.find((entry) => entry.provider === provider)!;
    return {
      defaultProvider,
      providers,
      tasks: AI_TASKS.map((task) => ({
        task: task.id,
        group: task.group,
        label: task.label,
        description: task.description,
        provider: 'fixedProvider' in task ? task.fixedProvider : (routes[task.id] ?? null),
        fixedProvider: 'fixedProvider' in task ? task.fixedProvider : null,
        effectiveProvider:
          'fixedProvider' in task
            ? this.ready(task.fixedProvider)
              ? task.fixedProvider
              : null
            : this.resolve(task.id),
      })),
      secretsKeyConfigured: this.cipher.available,
      configured: ready.length > 0,
      credit: (ready.find((entry) => entry.credit.low) ?? byId(defaultProvider)).credit,
    };
  }

  private credit(settings: StoredAiSettings): AiCreditView {
    const {
      creditBalanceCents,
      creditSetAt,
      creditSpentMicros,
      creditExhaustedAt,
      creditUnpriced,
    } = settings;
    const spentCents = Math.ceil(creditSpentMicros / MICROS_PER_CENT);
    const remainingCents =
      creditBalanceCents === null || creditUnpriced
        ? null
        : Math.max(0, creditBalanceCents - spentCents);
    const exhausted = creditExhaustedAt !== null;
    return {
      balanceCents: creditBalanceCents,
      setAt: creditSetAt,
      spentCents,
      remainingCents,
      exhausted,
      unpriced: creditUnpriced,
      low: exhausted || (remainingCents !== null && remainingCents < AI_CREDIT_ALERT_CENTS),
    };
  }

  /** Un appel en cours reste imputé à son fournisseur, même si le réglage change. */
  observer(provider: AiProvider): AiObserver {
    return {
      usage: (usage) => this.settings.recordUsage(provider, usageCostMicros(provider, usage)),
      creditExhausted: () =>
        this.settings.update(provider, { creditExhaustedAt: new Date().toISOString() }),
    };
  }

  configured(): boolean {
    return this.view().configured;
  }

  update(input: AiSettingsInput): AiSettingsView {
    const provider = input.provider ?? this.settings.activeProvider();
    const patch: Partial<StoredAiSettings> = {};
    if (input.apiKey !== undefined) {
      if (this.envKeys[provider]) {
        throw conflict(
          `La clé de l’IA vient de ${AI_PROVIDER_SETTINGS[provider].envKey} : elle se change dans l’environnement.`,
        );
      }
      // Jamais de clair : sans SECRETS_KEY, `encrypt` refuse en 409.
      patch.encryptedApiKey = input.apiKey
        ? this.cipher.encrypt(input.apiKey, KEY_CONTEXT[provider])
        : null;
    }
    if (input.model !== undefined) {
      patch.model = input.model?.trim() || null;
    }
    if (input.creditBalance !== undefined) {
      // Un nouveau relevé remplace tout : ce qui a été consommé avant y est déjà déduit.
      patch.creditBalanceCents =
        input.creditBalance === null ? null : Math.round(input.creditBalance * 100);
      patch.creditSetAt = input.creditBalance === null ? null : new Date().toISOString();
      patch.creditSpentMicros = 0;
      patch.creditExhaustedAt = null;
      patch.creditUnpriced = false;
      this.spendCache = null;
    }
    if (input.enabled !== undefined) {
      patch.enabled = input.enabled;
      this.spendCache = null;
    }
    if (input.adminKey !== undefined) {
      if (provider !== 'openai') throw badRequest('Seul OpenAI a une clé admin.');
      if (this.adminKeyEnv) {
        throw conflict(
          'La clé admin vient de OPENAI_ADMIN_KEY : elle se change dans l’environnement.',
        );
      }
      patch.encryptedAdminKey = input.adminKey
        ? this.cipher.encrypt(input.adminKey, ADMIN_KEY_CONTEXT)
        : null;
      this.spendCache = null;
    }
    for (const [task, chosen] of Object.entries(input.routes ?? {})) {
      if (AI_TASKS.some((entry) => entry.id === task && 'fixedProvider' in entry)) {
        throw badRequest('Cette tâche n’a qu’un fournisseur possible.');
      }
      if (chosen && !this.ready(chosen)) {
        throw badRequest(
          `${AI_PROVIDER_SETTINGS[chosen].label} n’a pas de clé : renseigne-la avant de lui confier une tâche.`,
        );
      }
      this.settings.setRoute(task as AiTask, chosen ?? null);
    }
    let defaultProvider = input.defaultProvider;
    if (defaultProvider && defaultProvider !== this.settings.activeProvider()) {
      const enabled =
        defaultProvider === provider && input.enabled !== undefined
          ? input.enabled
          : this.settings.get(defaultProvider).enabled;
      if (!enabled)
        throw badRequest('Ce fournisseur est désactivé : active-le avant d’en faire le défaut.');
    }
    // Désactiver le fournisseur par défaut passe le défaut à l'autre, s'il est activé.
    if (
      input.enabled === false &&
      !defaultProvider &&
      provider === this.settings.activeProvider()
    ) {
      defaultProvider = AI_PROVIDERS.find(
        (other) => other !== provider && this.settings.get(other).enabled,
      );
    }
    this.settings.update(provider, patch, defaultProvider);
    return this.view();
  }

  /**
   * La dépense réelle d'OpenAI, lue avec la clé admin, gardée cinq minutes (la vue se relit
   * chaque minute, l'API d'OpenAI n'a pas à l'être). Un échec est **rendu**, pas levé : une
   * clé admin refusée ne doit pas casser l'écran, il doit dire pourquoi.
   */
  async spend(): Promise<AiSpendView> {
    const none: AiSpendView = {
      available: false,
      monthCents: null,
      sinceNoteCents: null,
      remainingCents: null,
      error: null,
      fetchedAt: null,
    };
    const adminKey = this.adminKeyEnv ?? this.storedAdminKey();
    if (!adminKey || !this.costs) return none;

    const { creditBalanceCents, creditSetAt } = this.settings.get('openai');
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const noteDay = creditSetAt ? creditSetAt.slice(0, 10) : null;
    const since =
      noteDay && new Date(`${noteDay}T00:00:00Z`) < monthStart
        ? new Date(`${noteDay}T00:00:00Z`)
        : monthStart;
    const cacheKey = `${since.toISOString()}|${noteDay}|${creditBalanceCents}`;
    if (
      this.spendCache &&
      this.spendCache.since === cacheKey &&
      Date.now() - this.spendCache.at < SPEND_CACHE_MS
    ) {
      return this.spendCache.view;
    }

    let view: AiSpendView;
    try {
      const days = await this.costs.dailyCostsMicros(adminKey, since);
      const sum = (from: Date | null) =>
        days
          .filter((day) => !from || day.day >= from.toISOString().slice(0, 10))
          .reduce((total, day) => total + day.micros, 0);
      const toCents = (micros: number) => Math.ceil(micros / MICROS_PER_CENT);
      // Le jour de la note est compté en entier : le coût n'est connu qu'à la journée, et
      // mieux vaut annoncer un reste un peu bas que trop haut.
      const sinceNote = noteDay ? toCents(sum(new Date(`${noteDay}T00:00:00Z`))) : null;
      view = {
        available: true,
        monthCents: toCents(sum(monthStart)),
        sinceNoteCents: sinceNote,
        remainingCents:
          creditBalanceCents !== null && sinceNote !== null
            ? Math.max(0, creditBalanceCents - sinceNote)
            : null,
        error: null,
        fetchedAt: now.toISOString(),
      };
    } catch (error) {
      return {
        ...none,
        available: true,
        error: error instanceof Error ? error.message : 'Lecture des coûts impossible.',
      };
    }
    this.spendCache = { at: Date.now(), since: cacheKey, view };
    return view;
  }

  /**
   * La clé en clair et le modèle, pour un appel. `task` désigne ce que l'appelant fait : le
   * fournisseur choisi pour elle répond. 400 tant qu'aucun fournisseur n'est configuré.
   */
  credentials(task?: AiTask): AiCredentials {
    const provider = this.resolve(task);
    if (!provider) {
      const fallback = this.settings.activeProvider();
      throw badRequest(
        AI_PROVIDERS.every((entry) => !this.settings.get(entry).enabled)
          ? 'Tous les fournisseurs IA sont désactivés : active-en un dans Paramètres → API → Assistant IA.'
          : `Aucune clé API ${AI_PROVIDER_SETTINGS[fallback].label} : renseigne-la dans Paramètres → API → Assistant IA.`,
      );
    }
    const apiKey = this.apiKeyOf(provider);
    if (!apiKey)
      throw badRequest('Aucune clé API : renseigne-la dans Paramètres → API → Assistant IA.');
    const { model } = this.settings.get(provider);
    return { provider, apiKey, model: model ?? AI_PROVIDER_SETTINGS[provider].model };
  }
}
