import type { Branding } from '../../domain/branding/entities/Branding.ts';

const KEY = 'acs.branding';

/**
 * La dernière identité connue, gardée dans le navigateur **uniquement** pour le premier
 * affichage : sans elle, chaque chargement montrerait le nom et l'icône par défaut le
 * temps que l'API réponde. La base reste la seule source ; ce n'est qu'un reflet.
 */
export const readCachedBranding = (): Branding | undefined => {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Branding) : undefined;
  } catch {
    return undefined;
  }
};

export const writeCachedBranding = (branding: Branding) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(branding));
  } catch {
    // Stockage indisponible : le prochain chargement repartira du défaut, rien de plus.
  }
};
