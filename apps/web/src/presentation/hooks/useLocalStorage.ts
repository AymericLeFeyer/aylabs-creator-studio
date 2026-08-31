import { useCallback, useState } from 'react';

/**
 * État persisté dans le navigateur.
 * Les accès sont protégés : en navigation privée ou avec les cookies bloqués,
 * `localStorage` peut lever à la lecture comme à l'écriture.
 */
export const useLocalStorage = <T>(key: string, initialValue: T) => {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = window.localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      setValue((previous) => {
        const resolved = next instanceof Function ? next(previous) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // Stockage indisponible : l'état reste valable pour la session en cours.
        }
        return resolved;
      });
    },
    [key],
  );

  return [value, update] as const;
};
