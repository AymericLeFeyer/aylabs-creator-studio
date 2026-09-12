/**
 * Les sources de l'export (Paramètres → API). Duplique le contrat de l'API — toute
 * évolution doit être répercutée des deux côtés.
 */
export type IntegrationProvider = 'youtube' | 'instagram' | 'amazon' | 'domadoo' | 'discord';

export type IntegrationKind = 'local' | 'remote';

export type CredentialSource = 'env' | 'app';

export interface CredentialFieldView {
  key: string;
  label: string;
  secret: boolean;
  envVar: string;
  optional: boolean;
  hint: string;
  /** `env` l'emporte toujours : le champ est alors verrouillé à l'écran. */
  source: CredentialSource | null;
  /** Renseigné pour un champ non secret seulement : un secret ne redescend jamais. */
  value: string | null;
  /** Secret enregistré mais indéchiffrable — `SECRETS_KEY` a changé. */
  unreadable: boolean;
}

export interface IntegrationView {
  id: IntegrationProvider;
  label: string;
  description: string;
  kind: IntegrationKind;
  requiresBrowser: boolean;
  enabled: boolean;
  configured: boolean;
  fields: CredentialFieldView[];
  lastUpdate: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  durationMs: number | null;
  data: unknown;
}

export interface IntegrationsOverview {
  secretsKeyConfigured: boolean;
  providers: IntegrationView[];
}

export interface IntegrationUpdateInput {
  enabled?: boolean;
  /** Seulement les champs modifiés. `null` efface. */
  credentials?: Record<string, string | null>;
}

export interface CollectIntegrationResult {
  provider: IntegrationProvider;
  status: 'ok' | 'error' | 'skipped';
  message: string | null;
  durationMs: number;
}

export interface ExportKey {
  id: string;
  label: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CreatedExportKey {
  key: ExportKey;
  /** Montré une seule fois : l'API n'en garde que l'empreinte. */
  token: string;
}

export type IntegrationStatus = 'disabled' | 'unconfigured' | 'empty' | 'error' | 'ok' | 'never';

/**
 * L'état qu'annonce la pastille d'une source.
 *
 * `error` ne l'emporte que si l'échec est **plus récent** que la dernière réussite : une
 * collecte ratée il y a trois jours puis réussie depuis n'a plus rien à signaler.
 */
export const integrationStatus = (integration: IntegrationView): IntegrationStatus => {
  if (!integration.enabled) return 'disabled';
  if (!integration.configured) return integration.kind === 'local' ? 'empty' : 'unconfigured';
  if (
    integration.lastError &&
    (!integration.lastUpdate ||
      (integration.lastAttemptAt !== null && integration.lastAttemptAt > integration.lastUpdate))
  ) {
    return 'error';
  }
  return integration.lastUpdate ? 'ok' : 'never';
};
