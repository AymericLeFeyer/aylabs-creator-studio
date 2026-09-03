import type {
  CreateRecurringExpenseInput,
  RecurringExpense,
  RecurringExpenseView,
  UpdateRecurringExpenseInput,
} from '../entities/RecurringExpense.ts';

export interface RecurringExpenseRepository {
  findAll(includeInactive?: boolean): RecurringExpenseView[];
  findById(id: string): RecurringExpense | null;
  create(input: CreateRecurringExpenseInput): RecurringExpense;
  update(id: string, input: UpdateRecurringExpenseInput): RecurringExpense;
  /**
   * Supprime la règle. Les occurrences **futures** partent avec elle, les passées sont
   * détachées : ce qui a déjà été payé fait partie de la comptabilité, la projection non.
   */
  delete(id: string, today: string): void;
  /**
   * Efface les occurrences déjà projetées **à partir de** `from`, pour les réécrire.
   * Ce qui est antérieur ne bouge pas : un mois clos ne se recalcule pas parce qu'on
   * vient d'augmenter le prix d'un abonnement.
   */
  deleteOccurrencesFrom(id: string, from: string): void;
}
