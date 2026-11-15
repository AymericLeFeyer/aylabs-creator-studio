/**
 * L'assistant IA du studio — contrat dupliqué de l'API (`apps/api/src/domain/ai`).
 *
 * Réglé une fois, dans Paramètres → API → Assistant IA, et utilisé par les modules qui en
 * ont besoin (la boîte mail, pour l'instant). La clé ne sort jamais de l'API.
 */

export type AiKeySource = 'env' | 'app' | 'unreadable' | null;
export type AiProvider = 'anthropic' | 'openai';

/**
 * Le solde de crédits, **estimé** : c'est le montant
 * relevé dans la Console, moins ce que le studio a consommé depuis. Montants en centimes de
 * dollar. `exhausted` est certain : c'est l'API qui l'a dit.
 */
export interface AiCreditView {
  balanceCents: number | null;
  setAt: string | null;
  spentCents: number;
  remainingCents: number | null;
  exhausted: boolean;
  unpriced: boolean;
  low: boolean;
}

export interface AiSettingsView {
  provider: AiProvider;
  keySource: AiKeySource;
  model: string;
  secretsKeyConfigured: boolean;
  configured: boolean;
  credit: AiCreditView;
}

export interface AiSettingsInput {
  provider?: AiProvider;
  activeProvider?: AiProvider;
  /** Absent = conservée, `null` = effacée. */
  apiKey?: string | null;
  model?: string | null;
  /** Solde relevé, **en dollars**. Le poser remet la consommation à zéro. */
  creditBalance?: number | null;
}

export const formatDollars = (cents: number): string =>
  (cents / 100).toLocaleString('fr-FR', {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
  });

/** Les modèles proposés. Un autre identifiant reste saisissable. */
export const AI_PROVIDERS = {
  anthropic: {
    label: 'Claude (Anthropic)',
    envKey: 'ANTHROPIC_API_KEY',
    keyExample: 'sk-ant-…',
    billingUrl: 'https://platform.claude.com/settings/billing',
    models: [
      { id: 'claude-opus-5', label: 'Claude Opus 5 (recommandé)' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (plus rapide, moins cher)' },
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (le plus rapide)' },
    ],
  },
  openai: {
    label: 'GPT (OpenAI)',
    envKey: 'OPENAI_ASSISTANT_API_KEY',
    keyExample: 'sk-proj-…',
    billingUrl: 'https://platform.openai.com/settings/organization/billing/overview',
    models: [
      { id: 'gpt-6.1-sol', label: 'GPT-6.1 Sol (recommandé)' },
      { id: 'gpt-6-luna', label: 'GPT-6 Luna (moins cher)' },
      { id: 'gpt-6-astra', label: 'GPT-6 Astra' },
    ],
  },
} satisfies Record<
  AiProvider,
  {
    label: string;
    envKey: string;
    keyExample: string;
    billingUrl: string;
    models: Array<{ id: string; label: string }>;
  }
>;
