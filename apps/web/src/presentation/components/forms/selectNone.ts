/**
 * Valeur sentinelle des `Select` facultatifs.
 *
 * Radix refuse une `SelectItem` de valeur vide (elle sert à effacer la sélection) : il
 * faut donc une valeur non vide pour représenter « aucun ». Elle est partagée plutôt que
 * redéfinie dans chaque formulaire — trois sentinelles différentes finiraient par se
 * croiser dans un état de formulaire recopié d'un dialogue à l'autre.
 */
export const NONE = '__none__';

/** Identifiant nullable → valeur de `Select`. */
export const toSelectValue = (id: string | null | undefined): string => id ?? NONE;

/** Valeur de `Select` → identifiant nullable, prêt pour l'API. */
export const fromSelectValue = (value: string): string | null => (value === NONE ? null : value);
