import type { Browser } from 'playwright';
import { upstream } from '../../../shared/errors.ts';

let stealthLauncher: Promise<{
  launch: (options: { headless: boolean }) => Promise<Browser>;
}> | null = null;

/**
 * Le lanceur furtif, construit **une seule fois** : `firefox.use(plugin)` empile le plugin
 * dans une liste, et le rappeler à chaque collecte l'y ajouterait autant de fois.
 */
const stealthFirefox = () => {
  stealthLauncher ??= (async () => {
    const { firefox } = await import('playwright-extra');
    const { default: StealthPlugin } = await import('puppeteer-extra-plugin-stealth');
    const stealth = StealthPlugin();
    // Firefox a son propre user-agent : le remplacer par celui d'un Chrome est
    // précisément ce qui trahit un navigateur automatisé.
    stealth.enabledEvasions.delete('user-agent-override');
    firefox.use(stealth);
    return firefox as unknown as { launch: (options: { headless: boolean }) => Promise<Browser> };
  })();
  return stealthLauncher;
};

/**
 * Lance un Firefox sans interface.
 *
 * **Les imports sont dynamiques**, et c'est ce qui permet à l'API de démarrer sur une
 * machine sans navigateur (le développement sous Windows, une image construite avec
 * `INSTALL_BROWSERS=false`) : seules les sources qui scrapent échouent, avec un message
 * qui dit quoi faire, au lieu d'un crash au démarrage.
 *
 * `stealth` pour Domadoo, dont la page de connexion refuse un navigateur trop visiblement
 * automatisé ; Amazon passe sans.
 */
export const launchFirefox = async (options: { stealth: boolean }): Promise<Browser> => {
  try {
    if (options.stealth) return await (await stealthFirefox()).launch({ headless: true });
    const { firefox } = await import('playwright');
    return await firefox.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    throw upstream(
      `Navigateur indisponible (${message}). En local : « npx playwright install firefox » ; en production, l’image doit être construite avec INSTALL_BROWSERS=true.`,
    );
  }
};

/**
 * Espace insécable (U+00A0) et espace fine insécable (U+202F), les séparateurs de
 * milliers des pages françaises. Construits par leur code : écrits tels quels dans la
 * source, ils sont invisibles — et refusés par no-irregular-whitespace.
 */
const NON_BREAKING_SPACES = new RegExp('[' + String.fromCharCode(0xa0, 0x202f) + ']', 'g');

/** Normalise le texte d'une cellule : espaces insécables et retours à la ligne. */
export const cleanText = (text: string | null): string =>
  (text ?? '').replace(NON_BREAKING_SPACES, ' ').replace(/\s+/g, ' ').trim();
