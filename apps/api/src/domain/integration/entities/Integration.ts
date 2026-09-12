/**
 * Les sources de l'export : ce que le studio publie à l'extérieur (Home Assistant, un
 * widget…) et d'où il le tire.
 *
 * Deux familles, et elles ne se collectent pas pareil :
 *
 * - `local` — YouTube et Instagram. Le studio les collecte **déjà** pour ses propres
 *   écrans : l'export se calcule à la lecture depuis la base, rien à configurer ni à
 *   refaire tourner.
 * - `remote` — Amazon, Domadoo, Discord. Des comptes que le studio ne connaît pas
 *   autrement : un collecteur va les chercher, et le résultat est figé dans un
 *   instantané (`integration_snapshots`) que l'export relit.
 */
export type IntegrationProvider = 'youtube' | 'instagram' | 'amazon' | 'domadoo' | 'discord';

export type IntegrationKind = 'local' | 'remote';

export interface CredentialField {
  key: string;
  label: string;
  /** Un secret est chiffré en base et ne redescend jamais de l'API. */
  secret: boolean;
  /**
   * La variable d'environnement équivalente. Même nom que dans l'ancien
   * YouTube-Money-Exporter : un `.env` existant se recopie tel quel.
   */
  envVar: string;
  optional: boolean;
  hint: string;
}

export interface ProviderDefinition {
  id: IntegrationProvider;
  label: string;
  description: string;
  kind: IntegrationKind;
  /** Collecte par un navigateur sans interface : lente, et dépendante du DOM du site. */
  requiresBrowser: boolean;
  fields: CredentialField[];
}

export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'youtube',
    label: 'YouTube',
    description:
      'Abonnés, vues, heures vues, AdSense sur le mois et les 30 derniers jours, dernière vidéo. Toutes les chaînes actives cumulées.',
    kind: 'local',
    requiresBrowser: false,
    fields: [],
  },
  {
    id: 'instagram',
    label: 'Instagram',
    description: 'Abonnés, abonnements et publications des comptes connectés.',
    kind: 'local',
    requiresBrowser: false,
    fields: [],
  },
  {
    id: 'amazon',
    label: 'Amazon Partenaires',
    description:
      'Clics, articles commandés et expédiés, taux de conversion et gains du mois, paiements en attente.',
    kind: 'remote',
    requiresBrowser: true,
    fields: [
      {
        key: 'login',
        label: 'E-mail du compte',
        secret: false,
        envVar: 'AMAZON_LOGIN',
        optional: false,
        hint: 'Celui du compte Partenaires, sur partenaires.amazon.fr.',
      },
      {
        key: 'password',
        label: 'Mot de passe',
        secret: true,
        envVar: 'AMAZON_PASSWORD',
        optional: false,
        hint: '',
      },
      {
        key: 'otpSecret',
        label: 'Clé de double authentification',
        secret: true,
        envVar: 'AMAZON_SECRET_KEY',
        optional: true,
        hint: 'La clé de l’application d’authentification (pas le code à 6 chiffres). La méthode par défaut du compte doit être l’application, pas le SMS.',
      },
    ],
  },
  {
    id: 'domadoo',
    label: 'Domadoo',
    description:
      'Clics, ventes en attente et validées, gains sur 30 jours et depuis toujours, solde et paiements.',
    kind: 'remote',
    requiresBrowser: true,
    fields: [
      {
        key: 'login',
        label: 'E-mail du compte',
        secret: false,
        envVar: 'DOMADOO_LOGIN',
        optional: false,
        hint: '',
      },
      {
        key: 'password',
        label: 'Mot de passe',
        secret: true,
        envVar: 'DOMADOO_PASSWORD',
        optional: false,
        hint: '',
      },
    ],
  },
  {
    id: 'discord',
    label: 'Discord',
    description: 'Nombre de membres et de membres en ligne d’un serveur.',
    kind: 'remote',
    requiresBrowser: false,
    fields: [
      {
        key: 'inviteCode',
        label: 'Code d’invitation',
        secret: false,
        envVar: 'DISCORD_SERVER_CODE',
        optional: false,
        hint: 'La fin d’un lien discord.gg/…, de préférence une invitation sans expiration.',
      },
    ],
  },
];

export const INTEGRATION_ENV_VARS: string[] = PROVIDERS.flatMap((provider) =>
  provider.fields.map((field) => field.envVar),
);

export const isIntegrationProvider = (value: string): value is IntegrationProvider =>
  PROVIDERS.some((provider) => provider.id === value);

export const providerDefinition = (id: IntegrationProvider): ProviderDefinition =>
  PROVIDERS.find((provider) => provider.id === id)!;

/** D'où vient la valeur retenue. `env` l'emporte toujours sur `app`. */
export type CredentialSource = 'env' | 'app';

export interface CredentialFieldView extends CredentialField {
  source: CredentialSource | null;
  /** Renseigné pour un champ non secret seulement. */
  value: string | null;
  /** Secret stocké mais indéchiffrable : `SECRETS_KEY` a changé depuis l'enregistrement. */
  unreadable: boolean;
}

/** L'instantané d'une collecte distante. Un échec ne remplace jamais `data`. */
export interface IntegrationSnapshot {
  key: string;
  data: unknown;
  fetchedAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  durationMs: number | null;
}

export interface IntegrationView {
  id: IntegrationProvider;
  label: string;
  description: string;
  kind: IntegrationKind;
  requiresBrowser: boolean;
  /** Décoché, la source n'apparaît plus dans l'export et n'est plus collectée. */
  enabled: boolean;
  /** Tous les champs obligatoires ont une valeur (local : la base a quelque chose à dire). */
  configured: boolean;
  fields: CredentialFieldView[];
  lastUpdate: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  durationMs: number | null;
  /** Ce que l'export publie pour cette source, tel quel. */
  data: unknown;
}

export interface IntegrationsOverview {
  /** Sans `SECRETS_KEY`, aucun secret ne peut être enregistré depuis l'écran. */
  secretsKeyConfigured: boolean;
  providers: IntegrationView[];
}

export interface IntegrationUpdateInput {
  enabled?: boolean;
  /** Absent = on conserve. `null` ou `""` = on efface. */
  credentials?: Record<string, string | null>;
}

export interface CollectIntegrationResult {
  provider: IntegrationProvider;
  status: 'ok' | 'error' | 'skipped';
  message: string | null;
  durationMs: number;
}

/** Une clé d'accès à l'export. Le jeton lui-même n'est connu qu'au moment de la création. */
export interface ExportKey {
  id: string;
  label: string;
  /** Début du jeton, pour reconnaître une clé sans pouvoir la reconstituer. */
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface CreatedExportKey {
  key: ExportKey;
  token: string;
}
