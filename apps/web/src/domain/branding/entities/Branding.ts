/**
 * L'identité de l'application : son nom et son logo, réglés dans Paramètres → Général →
 * Personnalisation et partagés par tous les appareils. Contrat dupliqué de l'API
 * (`apps/api/src/domain/branding/entities/Branding.ts`).
 */
export interface Branding {
  /** `null` = le nom par défaut. */
  name: string | null;
  /** `null` = pas de logo : les icônes livrées avec le front servent. */
  logoVersion: string | null;
  updatedAt: string;
  /** Le nom à afficher, défaut compris — calculé par l'API. */
  displayName: string;
}

export const DEFAULT_APP_NAME = 'Creator Studio';

export const BRANDING_ICON_KEYS = [
  'favicon-32',
  'icon-192',
  'icon-512',
  'maskable-512',
  'apple-180',
] as const;
export type BrandingIconKey = (typeof BRANDING_ICON_KEYS)[number];

const DEFAULT_ICON_PATHS: Record<BrandingIconKey, string> = {
  'favicon-32': '/favicon-32.png',
  'icon-192': '/icon-192.png',
  'icon-512': '/icon-512.png',
  'maskable-512': '/icon-maskable-512.png',
  'apple-180': '/apple-touch-icon.png',
};

/** Même règle que `iconUrl` côté API : le logo déposé versionné, sinon l'icône livrée. */
export const brandingIconUrl = (
  branding: Pick<Branding, 'logoVersion'> | null | undefined,
  key: BrandingIconKey,
): string =>
  branding?.logoVersion
    ? `/api/branding/icons/${key}?v=${encodeURIComponent(branding.logoVersion)}`
    : DEFAULT_ICON_PATHS[key];
