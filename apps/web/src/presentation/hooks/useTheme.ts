import { useEffect, useState } from 'react';
import { useLocalStorage } from './useLocalStorage.ts';

/** Ce que l'utilisateur a choisi. `system` n'est pas une valeur figée : elle suit l'OS. */
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const QUERY = '(prefers-color-scheme: dark)';

const systemPrefersDark = (): boolean => window.matchMedia?.(QUERY).matches ?? false;

/**
 * Thème appliqué via la classe `.dark` sur `<html>`, aligné sur les tokens du CSS.
 *
 * **`system` est le défaut, et il est vivant** : un `useEffect` écoute le `change` de la
 * media query, pas seulement sa valeur au montage — sans lui, basculer le thème de l'OS
 * à 20 h ne changerait rien tant que l'onglet n'est pas rechargé. `light` et `dark`
 * restent deux choix explicites qui figent le thème indépendamment de l'OS.
 *
 * Compatible avec l'ancien stockage : `acs.theme` ne contenait jusqu'ici que `light` ou
 * `dark`, deux valeurs toujours valides du nouveau type — aucune migration à écrire.
 */
export const useTheme = () => {
  const [preference, setPreference] = useLocalStorage<ThemePreference>('acs.theme', 'system');
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  useEffect(() => {
    const media = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  const resolvedTheme: ResolvedTheme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  return { preference, resolvedTheme, setPreference };
};
