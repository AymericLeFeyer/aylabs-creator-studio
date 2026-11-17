/**
 * L'assistant IA du studio — contrat dupliqué de l'API (`apps/api/src/domain/ai`).
 *
 * Réglé une fois, dans Paramètres → API → Assistant IA, et utilisé par les modules qui en
 * ont besoin (la boîte mail, pour l'instant). La clé ne sort jamais de l'API.
 */

/** `shared` : la clé OpenAI des miniatures, réutilisée par l'assistant. */
export type AiKeySource = 'env' | 'app' | 'shared' | 'unreadable' | null;
export type AiProvider = 'anthropic' | 'openai';
export type AiTask =
  'script' | 'titles' | 'tags' | 'description' | 'thumbnails' | 'mail_reply' | 'mail_analysis';

/**
 * Le solde de crédits, **estimé** : le montant relevé dans la Console, moins ce que le
 * studio a consommé depuis. Montants en centimes de dollar. `exhausted` est certain : c'est
 * l'API qui l'a dit.
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

export interface AiProviderView {
  provider: AiProvider;
  label: string;
  envKey: string;
  keySource: AiKeySource;
  model: string;
  /** Désactivé : n'est proposé nulle part et ne répond à rien. Les clés sont conservées. */
  enabled: boolean;
  /** Une clé est disponible (indépendamment de l'activation). */
  configured: boolean;
  credit: AiCreditView;
  /** Clé admin (OpenAI seulement) : seule à lire la dépense réelle. */
  adminKeySource: AiKeySource;
}

/** La dépense réelle d'OpenAI, lue avec la clé admin. OpenAI n'a pas d'API de solde. */
export interface AiSpendView {
  available: boolean;
  monthCents: number | null;
  sinceNoteCents: number | null;
  remainingCents: number | null;
  error: string | null;
  fetchedAt: string | null;
}

export interface AiTaskView {
  task: AiTask;
  group: string;
  label: string;
  description: string;
  /** Le choix enregistré ; `null` = le fournisseur par défaut. */
  provider: AiProvider | null;
  /** Non `null` : un seul fournisseur possible, le choix est verrouillé. */
  fixedProvider: AiProvider | null;
  /** Celui qui répondra vraiment ; `null` si aucun fournisseur n'est utilisable. */
  effectiveProvider: AiProvider | null;
}

export interface AiSettingsView {
  defaultProvider: AiProvider;
  providers: AiProviderView[];
  tasks: AiTaskView[];
  secretsKeyConfigured: boolean;
  /** Au moins un fournisseur est prêt. */
  configured: boolean;
  /** Le solde le plus bas parmi les fournisseurs configurés : la pastille du menu. */
  credit: AiCreditView;
}

export interface AiSettingsInput {
  /** Fournisseur dont la clé, le modèle ou le solde est modifié. */
  provider?: AiProvider;
  /** Active ou désactive le fournisseur visé par `provider`. */
  enabled?: boolean;
  defaultProvider?: AiProvider;
  routes?: Partial<Record<AiTask, AiProvider | null>>;
  /** Absent = conservée, `null` = effacée. */
  apiKey?: string | null;
  adminKey?: string | null;
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
    short: 'Claude',
    accent: '#d97757',
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
    short: 'GPT',
    accent: '#10a37f',
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
    short: string;
    accent: string;
    envKey: string;
    keyExample: string;
    billingUrl: string;
    models: Array<{ id: string; label: string }>;
  }
>;
