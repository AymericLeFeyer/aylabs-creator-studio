import type {
  AiCredentials,
  AiCreditView,
  AiKeySource,
  AiProvider,
  AiSettingsInput,
  AiSettingsView,
  StoredAiSettings,
} from '../../../domain/ai/entities/Ai.ts';
import { AI_CREDIT_ALERT_CENTS, AI_PROVIDER_SETTINGS } from '../../../domain/ai/entities/Ai.ts';
import type {
  AiObserver,
  AiSettingsRepository,
} from '../../../domain/ai/repositories/AiRepository.ts';
import { usageCostMicros } from '../../../domain/ai/services/pricing.ts';
import type { SecretCipher } from '../../../domain/integration/repositories/IntegrationRepository.ts';
import { badRequest, conflict } from '../../../shared/errors.ts';

const KEY_CONTEXT = { anthropic: 'ai:apiKey', openai: 'ai:openaiKey' };
/**
 * La clé vivait dans les réglages mail, chiffrée sous ce contexte. La migration 53 l'a
 * recopiée telle quelle (un chiffré ne se réécrit pas en SQL) : elle se relit sous l'ancien
 * contexte, puis se rechiffre sous le nouveau à la première lecture.
 */
const LEGACY_KEY_CONTEXT = 'mail:aiKey';

const MICROS_PER_CENT = 10_000;

/**
 * Les réglages de l'assistant IA, et le **seul** endroit où sa clé est déchiffrée.
 * La clé d'environnement du fournisseur actif l'emporte sur l'écran.
 */
export class ManageAi {
  private readonly settings: AiSettingsRepository;
  private readonly cipher: SecretCipher;
  private readonly envKeys: Record<AiProvider, string | null>;

  constructor(
    settings: AiSettingsRepository,
    cipher: SecretCipher,
    envKeys: Record<AiProvider, string | null>,
  ) {
    this.settings = settings;
    this.cipher = cipher;
    this.envKeys = envKeys;
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
    if (!encryptedApiKey) return null;
    return this.storedKey(provider, encryptedApiKey) === null ? 'unreadable' : 'app';
  }

  view(): AiSettingsView {
    const provider = this.settings.activeProvider();
    const settings = this.settings.get(provider);
    const keySource = this.keySource(provider, settings.encryptedApiKey);
    return {
      provider,
      keySource,
      model: settings.model ?? AI_PROVIDER_SETTINGS[provider].model,
      secretsKeyConfigured: this.cipher.available,
      configured: keySource === 'env' || keySource === 'app',
      credit: this.credit(settings),
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
    const provider = input.provider ?? input.activeProvider ?? this.settings.activeProvider();
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
    }
    this.settings.update(provider, patch, input.activeProvider);
    return this.view();
  }

  /** La clé en clair et le modèle, pour un appel. 400 tant que rien n'est configuré. */
  credentials(): AiCredentials {
    const provider = this.settings.activeProvider();
    const { encryptedApiKey, model } = this.settings.get(provider);
    const apiKey = this.envKeys[provider] ?? this.storedKey(provider, encryptedApiKey);
    if (!apiKey) {
      throw badRequest(
        `Aucune clé API ${AI_PROVIDER_SETTINGS[provider].label} : renseigne-la dans Paramètres → API → Assistant IA.`,
      );
    }
    return { provider, apiKey, model: model ?? AI_PROVIDER_SETTINGS[provider].model };
  }
}
