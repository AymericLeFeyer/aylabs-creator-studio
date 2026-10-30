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
  /** Le solde relevé dans la Console, en centimes de dollar. `null` = jamais renseigné. */
  creditBalanceCents: number | null;
  creditSetAt: string | null;
  /** Ce que le studio a consommé depuis ce relevé, en millionièmes de dollar. */
  creditSpentMicros: number;
  /** Quand l'API a répondu que le solde était épuisé ; effacé au prochain appel réussi. */
  creditExhaustedAt: string | null;
}

/** Sous ce reste, l'écran et le menu préviennent (2 $). */
export const AI_CREDIT_ALERT_CENTS = 200;

/**
 * Le solde de crédits, **estimé**.
 *
 * L'API d'Anthropic n'expose aucun solde : seule la Console l'affiche. On part donc du
 * montant relevé à la main, et on en retire ce que le studio a consommé depuis — une clé
 * utilisée ailleurs que dans le studio n'est pas comptée. `exhausted` est le seul signal
 * certain : c'est l'API elle-même qui l'a dit.
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
  /** Absent = conservée, `null` ou `""` = effacée. */
  apiKey?: string | null;
  model?: string | null;
  /** Solde relevé, **en dollars**. Le poser remet la consommation à zéro ; `null` l'efface. */
  creditBalance?: number | null;
}

/** Les jetons facturés d'un appel, tels que l'API les rapporte. */
export interface AiUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface AiCredentials {
  apiKey: string;
  model: string;
}

export const DEFAULT_AI_MODEL = 'claude-opus-5';
