import type { SqliteTodoRepository } from '../../../infrastructure/production/repositories/SqliteTodoRepository.ts';
import type { ProductionRepository } from '../../../domain/production/repositories/ProductionRepository.ts';
import type { TodoItem } from '../../../domain/production/entities/StepTodo.ts';

/**
 * Cocher une tâche, et en tirer les conséquences sur son étape.
 *
 * **La règle, en une phrase : une étape est cochée exactement quand toutes ses tâches
 * le sont.** Cocher la dernière tâche de « montage » coche « montage » ; en décocher une
 * la décoche. Symétrique dans les deux sens, sinon on afficherait une étape terminée
 * portant un reste à faire — et le pourcentage global compterait deux fois le même
 * travail.
 *
 * Une étape **sans aucune tâche** échappe à la règle : rien ne peut la déduire, elle se
 * coche à la main depuis la modale. C'est le comportement d'avant, conservé tel quel
 * pour ceux qui n'utilisent pas les tâches.
 *
 * Le calcul vit ici et non dans le front : la pastille de la file d'attente, la fiche
 * et le planning affichent tous le même avancement, et trois déductions parallèles
 * finiraient par se contredire.
 */
export class ManageTodos {
  private readonly todos: SqliteTodoRepository;
  private readonly productions: ProductionRepository;

  constructor(todos: SqliteTodoRepository, productions: ProductionRepository) {
    this.todos = todos;
    this.productions = productions;
  }

  /** `checked` dit l'état **voulu**, pas l'état courant. */
  toggle(productionId: string, todoId: string, checked: boolean): TodoItem[] {
    if (checked) this.todos.check(productionId, todoId);
    else this.todos.uncheck(productionId, todoId);

    const items = this.todos.listForProduction(productionId);
    const stepId = items.find((item) => item.id === todoId)?.stepId ?? null;
    if (stepId) this.syncStep(productionId, stepId, items);

    return items;
  }

  /**
   * Aligne l'étape sur ses tâches. Appelée aussi après l'ajout ou la suppression d'une
   * tâche : ajouter une tâche à une étape déjà cochée doit la rouvrir, sinon elle
   * annoncerait terminé un travail qui vient d'apparaître.
   */
  syncStep(productionId: string, stepId: string, items?: TodoItem[]): void {
    const list = (items ?? this.todos.listForProduction(productionId)).filter(
      (item) => item.stepId === stepId,
    );
    if (list.length === 0) return;

    if (list.every((item) => item.checked)) this.productions.checkStep(productionId, stepId);
    else this.productions.uncheckStep(productionId, stepId);
  }

  /**
   * Coche ou décoche une étape **à la main**, en entraînant ses tâches.
   *
   * Marquer « montage » terminé d'un clic doit cocher ce qu'il restait : laisser des
   * tâches ouvertes sous une étape terminée rouvrirait l'étape à la première
   * resynchronisation, et le geste paraîtrait ne pas avoir pris.
   */
  toggleStep(productionId: string, stepId: string, checked: boolean): void {
    const items = this.todos
      .listForProduction(productionId)
      .filter((item) => item.stepId === stepId);

    for (const item of items) {
      if (checked && !item.checked) this.todos.check(productionId, item.id);
      if (!checked && item.checked) this.todos.uncheck(productionId, item.id);
    }

    if (checked) this.productions.checkStep(productionId, stepId);
    else this.productions.uncheckStep(productionId, stepId);
  }

  /** Ajoute une tâche ponctuelle et rouvre l'étape si elle était close. */
  addProductionTodo(productionId: string, stepId: string | null, label: string): TodoItem[] {
    this.todos.createProductionTodo({ productionId, stepId, label });
    if (stepId) this.syncStep(productionId, stepId);
    return this.todos.listForProduction(productionId);
  }

  /** Retire une tâche ponctuelle ; l'étape peut devenir complète du fait de ce retrait. */
  removeProductionTodo(id: string): void {
    const todo = this.todos.findProductionTodoById(id);
    this.todos.deleteProductionTodo(id);
    if (todo?.stepId) this.syncStep(todo.productionId, todo.stepId);
  }
}
