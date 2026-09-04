import type { DatabaseSync } from 'node:sqlite';
import { PUBLISH_STEP_ID } from '../../../domain/production/entities/ProductionStep.ts';
import { isFreshDatabase } from '../../../infrastructure/db/database.ts';

interface SeedStep {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

/**
 * Les étapes de départ, à identifiants fixes pour rester reconnaissables entre deux
 * redéploiements. Elles restent renommables, réordonnables et archivables, et rien
 * n'empêche d'en ajouter — c'est tout l'intérêt de les stocker en lignes.
 *
 * L'ordre est celui de l'affichage, pas celui de réalisation : les cases se cochent
 * dans n'importe quel sens.
 *
 * Elles ne sont posées **qu'une fois**, à la première ouverture : une étape supprimée ne
 * revient pas au redémarrage. Voir `isEmpty`.
 */
const DEFAULTS: SeedStep[] = [
  { id: 'ecriture', name: 'Écriture', color: '#3b82f6', sortOrder: 1 },
  { id: 'tournage', name: 'Tournage', color: '#f59e0b', sortOrder: 2 },
  { id: 'montage', name: 'Montage', color: '#8b5cf6', sortOrder: 3 },
  { id: 'miniature', name: 'Miniature', color: '#ec4899', sortOrder: 4 },
  { id: PUBLISH_STEP_ID, name: 'Publication', color: '#22c55e', sortOrder: 5 },
];

/**
 * Un référentiel ne se sème qu'une fois : **à la création de la base, et plus jamais.**
 *
 * Le seed tournait à chaque démarrage en n'insérant que ce qui manquait
 * (`ON CONFLICT DO NOTHING`), ce qui ressuscitait tout ce qu'on avait supprimé au
 * redéploiement suivant. Le raisonnement d'origine — « c'est l'archivage qui retire
 * durablement » — se défendait sur le papier, mais en pratique il rendait la suppression
 * inopérante : il fallait tout re-supprimer après chaque mise à jour.
 *
 * La condition est **la base neuve**, pas la table vide : la migration 2 insère la
 * catégorie « impots » avant que le moindre seed n'ait tourné, et se fier au décompte
 * sauterait alors le seed des catégories — AdSense comprise, qui est structurelle. La
 * table vide reste un filet en second : sans aucune ligne, l'écran correspondant se lit
 * comme une panne, et repartir des valeurs de départ vaut mieux qu'une page blanche.
 *
 * Le prix assumé : un futur défaut ajouté au code n'apparaîtra pas sur une base déjà
 * remplie. C'est le bon sens de l'échange — passé la première ouverture, le référentiel
 * appartient à celui qui l'utilise, pas à celui qui l'a livré.
 */
const shouldSeed = (db: DatabaseSync, table: string): boolean =>
  isFreshDatabase() ||
  (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n === 0;

export const seedDefaultSteps = (db: DatabaseSync): void => {
  if (!shouldSeed(db, 'production_steps')) return;

  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO production_steps
       (id, name, color, sort_order, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  );

  for (const step of DEFAULTS) {
    stmt.run(step.id, step.name, step.color, step.sortOrder, now, now);
  }
};
