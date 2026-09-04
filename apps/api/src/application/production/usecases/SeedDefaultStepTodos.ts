import type { DatabaseSync } from 'node:sqlite';
import { PUBLISH_STEP_ID } from '../../../domain/production/entities/ProductionStep.ts';
import { isFreshDatabase } from '../../../infrastructure/db/database.ts';

interface SeedTodo {
  id: string;
  stepId: string;
  label: string;
  sortOrder: number;
}

/**
 * Les tâches habituelles de départ, une poignée par étape.
 *
 * Identifiants fixes, comme les étapes : elles restent renommables, réordonnables,
 * archivables et supprimables depuis Paramètres → Étapes. Le but n'est pas d'imposer une
 * méthode mais d'éviter la page blanche — un référentiel vide se lit comme une
 * fonctionnalité en panne.
 *
 * Elles ne sont posées **qu'une fois**, à la première ouverture : une tâche supprimée ne
 * revient pas au redémarrage. Voir `isEmpty`.
 */
const DEFAULTS: SeedTodo[] = [
  { id: 'todo-ecriture-angle', stepId: 'ecriture', label: 'Trouver l’angle', sortOrder: 1 },
  { id: 'todo-ecriture-plan', stepId: 'ecriture', label: 'Plan détaillé', sortOrder: 2 },
  { id: 'todo-ecriture-script', stepId: 'ecriture', label: 'Script rédigé', sortOrder: 3 },
  {
    id: 'todo-ecriture-relecture',
    stepId: 'ecriture',
    label: 'Relecture à voix haute',
    sortOrder: 4,
  },

  { id: 'todo-tournage-materiel', stepId: 'tournage', label: 'Matériel préparé', sortOrder: 1 },
  { id: 'todo-tournage-lumiere', stepId: 'tournage', label: 'Lumière et son réglés', sortOrder: 2 },
  { id: 'todo-tournage-plans', stepId: 'tournage', label: 'Plans principaux', sortOrder: 3 },
  { id: 'todo-tournage-brolls', stepId: 'tournage', label: 'B-rolls', sortOrder: 4 },
  { id: 'todo-tournage-sauvegarde', stepId: 'tournage', label: 'Rushes sauvegardés', sortOrder: 5 },

  { id: 'todo-montage-derush', stepId: 'montage', label: 'Dérushage', sortOrder: 1 },
  { id: 'todo-montage-cut', stepId: 'montage', label: 'Montage cut', sortOrder: 2 },
  { id: 'todo-montage-habillage', stepId: 'montage', label: 'Habillage et textes', sortOrder: 3 },
  { id: 'todo-montage-musique', stepId: 'montage', label: 'Musique et sound design', sortOrder: 4 },
  { id: 'todo-montage-etalonnage', stepId: 'montage', label: 'Étalonnage', sortOrder: 5 },
  { id: 'todo-montage-export', stepId: 'montage', label: 'Export final', sortOrder: 6 },

  { id: 'todo-miniature-idees', stepId: 'miniature', label: 'Deux ou trois pistes', sortOrder: 1 },
  { id: 'todo-miniature-photo', stepId: 'miniature', label: 'Photo ou capture', sortOrder: 2 },
  { id: 'todo-miniature-finale', stepId: 'miniature', label: 'Version finale', sortOrder: 3 },

  { id: 'todo-publication-titre', stepId: PUBLISH_STEP_ID, label: 'Titre définitif', sortOrder: 1 },
  {
    id: 'todo-publication-description',
    stepId: PUBLISH_STEP_ID,
    label: 'Description et liens',
    sortOrder: 2,
  },
  {
    id: 'todo-publication-tags',
    stepId: PUBLISH_STEP_ID,
    label: 'Tags et chapitres',
    sortOrder: 3,
  },
  {
    id: 'todo-publication-sponsor',
    stepId: PUBLISH_STEP_ID,
    label: 'Mentions sponsor vérifiées',
    sortOrder: 4,
  },
  {
    id: 'todo-publication-programmation',
    stepId: PUBLISH_STEP_ID,
    label: 'Programmation',
    sortOrder: 5,
  },
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

export const seedDefaultStepTodos = (db: DatabaseSync): void => {
  if (!shouldSeed(db, 'step_todos')) return;

  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO step_todos
       (id, step_id, label, sort_order, is_archived, created_at, updated_at)
     VALUES (?, ?, ?, ?, 0, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
  );

  for (const todo of DEFAULTS) {
    // L'étape peut avoir été supprimée : la clé étrangère rejetterait l'insertion.
    const step = db.prepare('SELECT 1 FROM production_steps WHERE id = ?').get(todo.stepId);
    if (!step) continue;
    stmt.run(todo.id, todo.stepId, todo.label, todo.sortOrder, now, now);
  }
};
