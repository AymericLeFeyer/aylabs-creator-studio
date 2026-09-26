import type { GoalEntity, GoalEntityKind, GoalMetricId, GoalPoint } from '../entities/Goal.ts';

/**
 * Une série brute, telle que la base la connaît :
 * - `level` : une valeur **cumulée** par date de relevé (abonnés, vues au total) — la
 *   valeur d'un jour sans relevé est celle du dernier relevé connu ;
 * - `flux` : un **incrément** par date (AdSense du jour, produit reçu) — la valeur d'un
 *   jour est la somme de tous les incréments jusqu'à lui, zéro avant le premier.
 */
export interface RawGoalSeries {
  kind: 'level' | 'flux';
  points: GoalPoint[];
}

/**
 * Les lectures d'historique dont les objectifs ont besoin, toutes plateformes. Un port à
 * part, comme celui des achievements : ce sont des lectures sans période, qu'aucun autre
 * écran ne fait.
 */
export interface GoalSourceRepository {
  series(metric: GoalMetricId, entityId: string | null): RawGoalSeries;
  /** Chaînes et comptes non archivés. */
  entities(): Record<GoalEntityKind, GoalEntity[]>;
}
