/** Contrat de `/api/step-todos` et de `/api/productions/:id/todos`. */

export interface StepTodo {
  id: string;
  stepId: string;
  label: string;
  /** Durée moyenne, en minutes. `null` = retombe sur celle de l'étape. */
  defaultMinutes: number | null;
  sortOrder: number;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StepTodoInput {
  stepId: string;
  label: string;
  defaultMinutes?: number | null;
  sortOrder?: number;
  isArchived?: boolean;
}

/**
 * Une tâche telle qu'une vidéo l'affiche : référentiel et ponctuel réunis, à plat.
 * `origin` dit ce qu'on a le droit de supprimer depuis la fiche — une tâche du
 * référentiel se gère dans les paramètres, pas sur une vidéo.
 */
export interface TodoItem {
  id: string;
  stepId: string | null;
  label: string;
  defaultMinutes: number | null;
  origin: 'step' | 'production';
  checked: boolean;
  checkedAt: string | null;
  sortOrder: number;
}

/** Les tâches d'une étape donnée, dans l'ordre d'affichage. */
export const todosOfStep = (todos: TodoItem[], stepId: string): TodoItem[] =>
  todos.filter((todo) => todo.stepId === stepId);

/** « 2/5 » sur la pastille d'une étape. `null` quand l'étape n'a aucune tâche. */
export const stepTodoRatio = (
  todos: TodoItem[],
  stepId: string,
): { done: number; total: number } | null => {
  const list = todosOfStep(todos, stepId);
  if (list.length === 0) return null;
  return { done: list.filter((todo) => todo.checked).length, total: list.length };
};
