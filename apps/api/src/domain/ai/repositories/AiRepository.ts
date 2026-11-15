import type { AiCredentials, AiProvider, AiUsage, StoredAiSettings } from '../entities/Ai.ts';

export interface AiSettingsRepository {
  activeProvider(): AiProvider;
  get(provider: AiProvider): StoredAiSettings;
  update(provider: AiProvider, patch: Partial<StoredAiSettings>, activate?: AiProvider): void;
  /** Ajoute au compteur, sans lire ni réécrire : deux appels simultanés ne s'écrasent pas. */
  recordUsage(provider: AiProvider, micros: number | null): void;
}

/** Ce que le client rapporte après coup. C'est lui seul qui voit les réponses de l'API. */
export interface AiObserver {
  usage(usage: AiUsage): void;
  /** L'API a refusé l'appel faute de crédits. */
  creditExhausted(): void;
}

export interface AiRequest {
  system: string;
  prompt: string;
  /**
   * Un schéma JSON : la réponse est alors **contrainte** à ce format (structured outputs) et
   * rendue telle quelle, à parser par l'appelant. Absent : du texte libre.
   */
  schema?: Record<string, unknown>;
}

/** Le modèle : une requête, une réponse. Aucun outil, aucun effet de bord. */
export interface AiClient {
  complete(credentials: AiCredentials, request: AiRequest): Promise<string>;
}
