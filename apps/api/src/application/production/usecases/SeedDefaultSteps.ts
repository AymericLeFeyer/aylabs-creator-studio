import type { DatabaseSync } from 'node:sqlite';
import { PUBLISH_STEP_ID } from '../../../domain/production/entities/ProductionStep.ts';

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
 */
const DEFAULTS: SeedStep[] = [
  { id: 'ecriture', name: 'Écriture', color: '#3b82f6', sortOrder: 1 },
  { id: 'tournage', name: 'Tournage', color: '#f59e0b', sortOrder: 2 },
  { id: 'montage', name: 'Montage', color: '#8b5cf6', sortOrder: 3 },
  { id: 'miniature', name: 'Miniature', color: '#ec4899', sortOrder: 4 },
  { id: PUBLISH_STEP_ID, name: 'Publication', color: '#22c55e', sortOrder: 5 },
];

export const seedDefaultSteps = (db: DatabaseSync): void => {
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
