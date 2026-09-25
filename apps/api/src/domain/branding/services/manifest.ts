import {
  DEFAULT_APP_NAME,
  DEFAULT_ICON_PATHS,
  type Branding,
  type BrandingIconKey,
} from '../entities/Branding.ts';

/**
 * L'adresse d'une icône : celle du logo déposé (versionnée, pour qu'un cache garde
 * l'ancien logo le moins longtemps possible), sinon le fichier livré avec le front.
 */
export const iconUrl = (branding: Branding, key: BrandingIconKey): string =>
  branding.logoVersion
    ? `/api/branding/icons/${key}?v=${encodeURIComponent(branding.logoVersion)}`
    : DEFAULT_ICON_PATHS[key];

export const appName = (branding: Branding): string => branding.name ?? DEFAULT_APP_NAME;

/**
 * Le manifeste PWA, construit à chaque requête depuis le nom et le logo.
 *
 * **Toutes les adresses sont absolues** (`/`, `/api/branding/icons/…`) : servi depuis
 * `/api/branding/manifest`, un chemin relatif se résoudrait contre `/api/branding/`, et
 * `start_url` pointerait dans l'API. `id` reste `/` : c'est lui qui identifie
 * l'application installée, et le changer en ferait une seconde application aux yeux
 * d'Android.
 */
export const buildManifest = (branding: Branding) => {
  const name = appName(branding);
  const icon192 = iconUrl(branding, 'icon-192');
  return {
    name,
    short_name: name,
    description: 'Statistiques de créateur, production des vidéos, partenariats et comptabilité.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    lang: 'fr',
    dir: 'ltr',
    theme_color: '#ffffff',
    background_color: '#ffffff',
    categories: ['productivity', 'business'],
    icons: [
      { src: icon192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      {
        src: iconUrl(branding, 'icon-512'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: iconUrl(branding, 'maskable-512'),
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Production',
        short_name: 'Production',
        description: "La file d'attente et le planning des vidéos",
        url: '/production',
        icons: [{ src: icon192, sizes: '192x192', type: 'image/png' }],
      },
      {
        name: "Chiffre d'affaires",
        short_name: 'CA',
        description: 'Revenus, dépenses et bénéfices',
        url: '/chiffre-affaires',
        icons: [{ src: icon192, sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Sponsors',
        short_name: 'Sponsors',
        description: 'Les sponsos à livrer et à encaisser',
        url: '/sponsors',
        icons: [{ src: icon192, sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
};
