import type {
  AiCredentials,
  AiKeySource,
  AiSettingsInput,
  AiSettingsView,
} from '../../../domain/ai/entities/Ai.ts';
import { DEFAULT_AI_MODEL } from '../../../domain/ai/entities/Ai.ts';
import type { AiSettingsRepository } from '../../../domain/ai/repositories/AiRepository.ts';
import type { SecretCipher } from '../../../domain/integration/repositories/IntegrationRepository.ts';
import { badRequest, conflict } from '../../../shared/errors.ts';

const KEY_CONTEXT = 'ai:apiKey';
/**
 * La clé vivait dans les réglages mail, chiffrée sous ce contexte. La migration 53 l'a
 * recopiée telle quelle (un chiffré ne se réécrit pas en SQL) : elle se relit sous l'ancien
 * contexte, puis se rechiffre sous le nouveau à la première lecture.
 */
const LEGACY_KEY_CONTEXT = 'mail:aiKey';

/**
 * Les réglages de l'assistant IA, et le **seul** endroit où sa clé est déchiffrée.
 * `ANTHROPIC_API_KEY` l'emporte toujours sur l'écran.
 */
export class ManageAi {
  private readonly settings: AiSettingsRepository;
  private readonly cipher: SecretCipher;
  private readonly envKey: string | null;

  constructor(settings: AiSettingsRepository, cipher: SecretCipher, envKey: string | null) {
    this.settings = settings;
    this.cipher = cipher;
    this.envKey = envKey;
  }

  private storedKey(): string | null {
    const { encryptedApiKey } = this.settings.get();
    if (!encryptedApiKey) return null;
    const current = this.cipher.decrypt(encryptedApiKey, KEY_CONTEXT);
    if (current !== null) return current;
    const legacy = this.cipher.decrypt(encryptedApiKey, LEGACY_KEY_CONTEXT);
    if (legacy !== null && this.cipher.available) {
      this.settings.update({ encryptedApiKey: this.cipher.encrypt(legacy, KEY_CONTEXT) });
    }
    return legacy;
  }

  private keySource(): AiKeySource {
    if (this.envKey) return 'env';
    if (!this.settings.get().encryptedApiKey) return null;
    return this.storedKey() === null ? 'unreadable' : 'app';
  }

  view(): AiSettingsView {
    const keySource = this.keySource();
    return {
      keySource,
      model: this.settings.get().model ?? DEFAULT_AI_MODEL,
      secretsKeyConfigured: this.cipher.available,
      configured: keySource === 'env' || keySource === 'app',
    };
  }

  configured(): boolean {
    return this.view().configured;
  }

  update(input: AiSettingsInput): AiSettingsView {
    if (input.apiKey !== undefined) {
      if (this.envKey) {
        throw conflict(
          'La clé de l’IA vient de ANTHROPIC_API_KEY : elle se change dans l’environnement.',
        );
      }
      // Jamais de clair : sans SECRETS_KEY, `encrypt` refuse en 409.
      this.settings.update({
        encryptedApiKey: input.apiKey ? this.cipher.encrypt(input.apiKey, KEY_CONTEXT) : null,
      });
    }
    if (input.model !== undefined) {
      this.settings.update({ model: input.model?.trim() ? input.model.trim() : null });
    }
    return this.view();
  }

  /** La clé en clair et le modèle, pour un appel. 400 tant que rien n'est configuré. */
  credentials(): AiCredentials {
    const apiKey = this.envKey ?? this.storedKey();
    if (!apiKey) {
      throw badRequest(
        'Aucune clé API Anthropic : renseigne-la dans Paramètres → API → Assistant IA.',
      );
    }
    return { apiKey, model: this.settings.get().model ?? DEFAULT_AI_MODEL };
  }
}
