import { useCallback, useSyncExternalStore } from 'react';

/**
 * Les abonnés de chaque clé. Deux composants qui lisent la même clé (`usePreferences`
 * dans `AppLayout` et dans Paramètres → Général) doivent voir la même valeur : avec un
 * `useState` par instance, l'écriture de l'un n'atteignait jamais l'autre, et la barre du
 * bas mobile ne suivait pas son réglage avant un rechargement.
 */
const listeners = new Map<string, Set<() => void>>();

/** Dernière lecture par clé : `useSyncExternalStore` exige un instantané stable. */
const cache = new Map<string, { raw: string | null; value: unknown }>();

/** Valeur tenue en mémoire quand le stockage est indisponible (navigation privée). */
const memory = new Map<string, string>();

const readRaw = (key: string): string | null => {
  if (memory.has(key)) return memory.get(key) ?? null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const notify = (key: string) => listeners.get(key)?.forEach((listener) => listener());

/**
 * État persisté dans le navigateur, **partagé entre toutes les instances de la même clé**
 * (et entre onglets, par l'événement `storage`).
 * Les accès sont protégés : en navigation privée ou avec les cookies bloqués,
 * `localStorage` peut lever à la lecture comme à l'écriture.
 */
export const useLocalStorage = <T>(key: string, initialValue: T) => {
  const subscribe = useCallback(
    (listener: () => void) => {
      const set = listeners.get(key) ?? new Set();
      set.add(listener);
      listeners.set(key, set);
      const onStorage = (event: StorageEvent) => {
        if (event.key === key) listener();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        set.delete(listener);
        window.removeEventListener('storage', onStorage);
      };
    },
    [key],
  );

  const getSnapshot = useCallback((): T => {
    const raw = readRaw(key);
    const cached = cache.get(key);
    if (cached && cached.raw === raw) return (cached.value ?? initialValue) as T;
    let value: T | undefined;
    try {
      value = raw ? (JSON.parse(raw) as T) : undefined;
    } catch {
      value = undefined;
    }
    cache.set(key, { raw, value });
    return value ?? initialValue;
  }, [key, initialValue]);

  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const update = useCallback(
    (next: T | ((previous: T) => T)) => {
      const resolved = next instanceof Function ? next(getSnapshot()) : next;
      const raw = JSON.stringify(resolved);
      try {
        window.localStorage.setItem(key, raw);
      } catch {
        // Stockage indisponible : l'état reste valable pour la session en cours.
        memory.set(key, raw);
      }
      notify(key);
    },
    [key, getSnapshot],
  );

  return [value, update] as const;
};
