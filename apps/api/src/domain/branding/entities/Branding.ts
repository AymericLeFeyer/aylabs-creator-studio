/**
 * L'identité de l'application : son nom et son logo, les mêmes sur tous les appareils.
 *
 * Côté serveur et non dans le navigateur parce que le **manifeste PWA** en dépend : c'est
 * l'API qui le sert (`/api/branding/manifest`), et un manifeste ne peut pas lire le
 * `localStorage` de celui qui installe l'application.
 */
export interface Branding {
  /** `null` = le nom par défaut (`DEFAULT_APP_NAME`). */
  name: string | null;
  /**
   * Change à chaque logo déposé ; `null` = pas de logo, les icônes livrées avec le front
   * servent. Il part dans l'adresse des icônes (`?v=`) : un navigateur qui a gardé
   * l'ancien logo en cache demande alors une autre adresse.
   */
  logoVersion: string | null;
  updatedAt: string;
}

export const DEFAULT_APP_NAME = 'Creator Studio';

/**
 * Les icônes produites par le navigateur à partir du logo déposé. Une liste fermée : ce
 * sont exactement les emplacements du manifeste, de l'onglet et de l'écran d'accueil iOS.
 *
 * | Clé            | Taille | Fond        | Pour qui                               |
 * | -------------- | ------ | ----------- | -------------------------------------- |
 * | `favicon-32`   | 32     | transparent | onglet                                 |
 * | `icon-192`     | 192    | transparent | manifeste `any`, barre latérale        |
 * | `icon-512`     | 512    | transparent | manifeste `any`                        |
 * | `maskable-512` | 512    | blanc, 60 % | manifeste `maskable` (Android rogne)   |
 * | `apple-180`    | 180    | blanc       | écran d'accueil iOS (ignore l'alpha)   |
 */
export const BRANDING_ICON_KEYS = [
  'favicon-32',
  'icon-192',
  'icon-512',
  'maskable-512',
  'apple-180',
] as const;
export type BrandingIconKey = (typeof BRANDING_ICON_KEYS)[number];

/** Le fichier livré avec le front pour chaque emplacement, quand aucun logo n'est posé. */
export const DEFAULT_ICON_PATHS: Record<BrandingIconKey, string> = {
  'favicon-32': '/favicon-32.png',
  'icon-192': '/icon-192.png',
  'icon-512': '/icon-512.png',
  'maskable-512': '/icon-maskable-512.png',
  'apple-180': '/apple-touch-icon.png',
};
