/**
 * Les préférences **partagées entre appareils** : ce qu'on règle sur l'ordinateur et qu'on
 * veut retrouver tel quel sur le téléphone (la barre du bas, par exemple).
 *
 * Une table clé → valeur JSON plutôt qu'une colonne par réglage : c'est une préférence
 * d'affichage, sans règle métier, et en ajouter une ne doit pas demander de migration.
 * L'API ne connaît pas la forme des valeurs ; c'est le front, qui seul les lit, qui les
 * valide et retombe sur son défaut quand une valeur ne lui convient pas.
 *
 * Les préférences propres à un appareil (menu replié, zoom du planning) restent, elles,
 * dans le navigateur (`usePreferences`).
 */
export interface SharedPreferenceRepository {
  /** Toutes les préférences, `{ clé: valeur }`. */
  findAll(): Record<string, unknown>;
  set(key: string, value: unknown): void;
}
