import type { Goal, GoalInput, GoalUpdate } from '../entities/Goal.ts';

export interface GoalRepository {
  findAll(): Goal[];
  findById(id: string): Goal;
  create(input: GoalInput): Goal;
  update(id: string, input: GoalUpdate): Goal;
  delete(id: string): void;
  /** Réécrit l'ordre `1..n` en transaction. */
  reorder(ids: string[]): Goal[];
}
