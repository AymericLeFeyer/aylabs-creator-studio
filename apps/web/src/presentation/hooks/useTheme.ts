import { useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage.ts';

export type Theme = 'light' | 'dark';

const prefersDark = (): boolean =>
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;

/** Thème appliqué via la classe `.dark` sur `<html>`, aligné sur les tokens du CSS. */
export const useTheme = () => {
  const [theme, setTheme] = useLocalStorage<Theme>('acs.theme', prefersDark() ? 'dark' : 'light');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return {
    theme,
    toggle: () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
  };
};
