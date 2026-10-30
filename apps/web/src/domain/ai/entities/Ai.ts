/**
 * L'assistant IA du studio — contrat dupliqué de l'API (`apps/api/src/domain/ai`).
 *
 * Réglé une fois, dans Paramètres → API → Assistant IA, et utilisé par les modules qui en
 * ont besoin (la boîte mail, pour l'instant). La clé ne sort jamais de l'API.
 */

export type AiKeySource = 'env' | 'app' | 'unreadable' | null;

export interface AiSettingsView {
  keySource: AiKeySource;
  model: string;
  secretsKeyConfigured: boolean;
  configured: boolean;
}

export interface AiSettingsInput {
  /** Absent = conservée, `null` = effacée. */
  apiKey?: string | null;
  model?: string | null;
}

/** Les modèles proposés. Un autre identifiant reste saisissable. */
export const AI_MODELS = [
  { id: 'claude-opus-5', label: 'Claude Opus 5 (recommandé)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (plus rapide, moins cher)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (le plus rapide)' },
];
