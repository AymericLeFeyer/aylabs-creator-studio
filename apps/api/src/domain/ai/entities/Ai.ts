/**
 * L'assistant IA du studio (Claude, par l'API d'Anthropic).
 *
 * Un domaine **à part** et non un réglage des mails : la boîte mail en est le premier
 * utilisateur, pas le seul. La clé et le modèle se règlent une fois, dans Paramètres →
 * API → Assistant IA, et tout module qui en a besoin passe par `ManageAi.credentials()`.
 *
 * **L'IA ne fait que proposer.** Aucun module ne lui donne d'outil qui agisse à la place de
 * l'utilisateur (envoyer un mail, publier) : elle rend du texte ou des données, que le code
 * applique dans les limites qu'il fixe lui-même.
 */

export type AiKeySource = 'env' | 'app' | 'unreadable' | null;

export interface StoredAiSettings {
  /** Chiffrée par `SecretBox`. Seul `ManageAi` la lit en clair. */
  encryptedApiKey: string | null;
  model: string | null;
}

export interface AiSettingsView {
  keySource: AiKeySource;
  model: string;
  secretsKeyConfigured: boolean;
  configured: boolean;
}

export interface AiSettingsInput {
  /** Absent = conservée, `null` ou `""` = effacée. */
  apiKey?: string | null;
  model?: string | null;
}

export interface AiCredentials {
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_MODEL = 'claude-opus-5';
