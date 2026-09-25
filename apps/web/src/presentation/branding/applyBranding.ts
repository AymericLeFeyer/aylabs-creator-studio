import {
  brandingIconUrl,
  DEFAULT_APP_NAME,
  type Branding,
} from '../../domain/branding/entities/Branding.ts';
import { writeCachedBranding } from '../../infrastructure/branding/brandingCache.ts';

const setAttribute = (selector: string, attribute: string, value: string) => {
  document.querySelectorAll(selector).forEach((element) => {
    if (element.getAttribute(attribute) !== value) element.setAttribute(attribute, value);
  });
};

/**
 * Reporte le nom et le logo sur ce que `index.html` a posé en dur : titre de l'onglet,
 * favicons, icône d'écran d'accueil iOS et titre de l'app installée sur iOS.
 *
 * Le manifeste n'a rien à faire ici : `index.html` pointe déjà sur `/api/branding/manifest`,
 * construit par l'API à chaque lecture.
 *
 * Sans logo, les favicons retrouvent l'adresse **d'origine** de chaque balise (gardée dans
 * `data-default-href` au premier passage) : `index.html` en déclare trois tailles, et les
 * ramener toutes à la même perdrait le `.ico` des vieux navigateurs.
 */
export const applyBranding = (branding: Branding | undefined) => {
  const name = branding?.displayName ?? DEFAULT_APP_NAME;
  if (document.title !== name) document.title = name;
  setAttribute('meta[name="apple-mobile-web-app-title"]', 'content', name);

  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"]').forEach((link) => {
    const original = link.dataset.defaultHref ?? link.getAttribute('href') ?? '';
    link.dataset.defaultHref = original;
    const href = branding?.logoVersion ? brandingIconUrl(branding, 'favicon-32') : original;
    if (link.getAttribute('href') !== href) link.setAttribute('href', href);
  });
  setAttribute('link[rel="apple-touch-icon"]', 'href', brandingIconUrl(branding, 'apple-180'));

  if (branding) writeCachedBranding(branding);
};
