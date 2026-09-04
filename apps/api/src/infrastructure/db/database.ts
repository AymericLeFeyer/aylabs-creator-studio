import { DatabaseSync } from 'node:sqlite';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import { runMigrations } from './migrations.ts';

let instance: DatabaseSync | null = null;

/**
 * Ouvre (ou réutilise) la connexion SQLite unique du process.
 *
 * WAL est activé pour que la collecte planifiée puisse écrire pendant qu'une requête
 * du dashboard lit, sans se bloquer mutuellement.
 */
/**
 * `true` quand la base venait d'être créée à l'ouverture.
 *
 * Retenu ici parce que l'information ne survit pas à `runMigrations` : dès le premier
 * appel, `user_version` vaut la dernière version et la base ne se distingue plus d'une
 * base déjà utilisée. Ce sont les seeds qui en ont besoin — eux seuls doivent savoir s'ils
 * ont affaire à une première ouverture.
 */
let createdNow = false;

export const isFreshDatabase = (): boolean => createdNow;

export const getDatabase = (databasePath: string): DatabaseSync => {
  if (instance) return instance;

  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true });
  }

  const db = new DatabaseSync(databasePath);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');

  createdNow = runMigrations(db);

  instance = db;
  return db;
};

export const closeDatabase = (): void => {
  instance?.close();
  instance = null;
};

/** Convertit un booléen JS en INTEGER SQLite (SQLite n'a pas de type booléen). */
export const toSqlBool = (value: boolean): number => (value ? 1 : 0);
export const fromSqlBool = (value: unknown): boolean => value === 1 || value === true;
