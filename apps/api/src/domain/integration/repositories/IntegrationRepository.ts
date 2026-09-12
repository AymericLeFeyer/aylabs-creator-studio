import type {
  ExportKey,
  IntegrationProvider,
  IntegrationSnapshot,
} from '../entities/Integration.ts';
import type { InstagramExport, YouTubeExport } from '../entities/ExportData.ts';

export interface StoredCredential {
  key: string;
  /** Chiffrée quand `isSecret` : c'est au chiffreur de la relire. */
  value: string;
  isSecret: boolean;
}

export interface IntegrationRepository {
  /** Vrai par défaut : une source qu'on n'a jamais touchée n'est pas désactivée. */
  isEnabled(provider: IntegrationProvider): boolean;
  setEnabled(provider: IntegrationProvider, enabled: boolean): void;
  storedCredentials(provider: IntegrationProvider): StoredCredential[];
  /** `null` efface la valeur. */
  setCredential(
    provider: IntegrationProvider,
    key: string,
    value: string | null,
    isSecret: boolean,
  ): void;
  snapshot(key: string): IntegrationSnapshot | null;
  /** Remplace la donnée et efface l'erreur. */
  saveSuccess(key: string, data: unknown, durationMs: number): void;
  /** Note l'échec **sans toucher à la donnée** : la dernière bonne valeur reste publiée. */
  saveFailure(key: string, error: string, durationMs: number): void;
}

export interface ExportKeyRepository {
  findAll(): ExportKey[];
  create(label: string, tokenHash: string, prefix: string): ExportKey;
  delete(id: string): void;
  /** Horodate l'usage de la clé et dit si elle existe. */
  touch(tokenHash: string): boolean;
  count(): number;
}

/** Ce que l'export tire de ce que le studio collecte déjà. */
export interface LocalSourceRepository {
  youtube(today: string): YouTubeExport | null;
  instagram(): InstagramExport | null;
}

/**
 * Chiffrement des secrets au repos. `context` lie un chiffré à son emplacement
 * (`amazon:password`) : recopier la valeur d'un champ dans un autre la rend illisible.
 */
export interface SecretCipher {
  readonly available: boolean;
  encrypt(plain: string, context: string): string;
  /** `null` si la clé a changé ou si la valeur a été altérée. */
  decrypt(payload: string, context: string): string | null;
}
