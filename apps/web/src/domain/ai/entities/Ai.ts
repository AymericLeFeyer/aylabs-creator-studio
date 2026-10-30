/**
 * L'assistant IA du studio — contrat dupliqué de l'API (`apps/api/src/domain/ai`).
 *
 * Réglé une fois, dans Paramètres → API → Assistant IA, et utilisé par les modules qui en
 * ont besoin (la boîte mail, pour l'instant). La clé ne sort jamais de l'API.
 */

export type AiKeySource = 'env' | 'app' | 'unreadable' | null;

/**
 * Le solde de crédits, **estimé** : Anthropic n'expose aucun solde par API. C'est le montant
 * relevé dans la Console, moins ce que le studio a consommé depuis. Montants en centimes de
 * dollar. `exhausted` est certain : c'est l'API qui l'a dit.
 */
export interface AiCreditView {
  balanceCents: number | null;
  setAt: string | null;
  spentCents: number;
  remainingCents: number | null;
  exhausted: boolean;
  low: boolean;
}

export interface AiSettingsView {
  keySource: AiKeySource;
  model: string;
  secretsKeyConfigured: boolean;
  configured: boolean;
  credit: AiCreditView;
}

export interface AiSettingsInput {
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
export const AI_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 (recommandé)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (plus rapide, moins cher)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (le plus rapide)' },
];
