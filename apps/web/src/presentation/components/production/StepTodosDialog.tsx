import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, CircleCheck, Plus, Trash2 } from 'lucide-react';
import {
  useAddProductionTodo,
  useDeleteProductionTodo,
  useProductionSteps,
  useReorderStepTodos,
  useReorderSteps,
  useStepTodos,
  useToggleStep,
  useToggleTodo,
} from '../../../application/production/usecases/useProductions.ts';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { isStepChecked } from '../../../domain/production/entities/Production.ts';
import type { ProductionStep } from '../../../domain/production/entities/ProductionStep.ts';
import { todosOfStep } from '../../../domain/production/entities/StepTodo.ts';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { cn } from '../../../shared/cn.ts';

interface StepTodosDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  production: Production;
  step: ProductionStep | null;
}

/**
 * Ce qu'il y a à faire dans une étape, pour cette vidéo.
 *
 * Cliquer une pastille d'étape ouvre cette modale au lieu de cocher l'étape d'un coup :
 * « montage » n'est pas un interrupteur, c'est une liste de choses à faire, et la cocher
 * en bloc quand il reste le sound design est exactement ce qui fait perdre le fil.
 *
 * **L'étape se coche toute seule quand ses tâches le sont** (règle tenue côté API, dans
 * `ManageTodos`). Le bouton « Tout marquer terminé » est le raccourci pour les jours où
 * on a travaillé sans cocher au fil de l'eau ; il coche aussi les tâches, sinon l'étape
 * se rouvrirait aussitôt.
 *
 * Le champ d'ajout crée une tâche **ponctuelle**, propre à cette vidéo. Les tâches
 * habituelles, elles, se gèrent dans Paramètres → Étapes : les mélanger ici ferait
 * ajouter « demander l'autorisation pour la musique » à toutes les vidéos à venir.
 *
 * **L'ordre se règle aussi d'ici**, sans passer par les paramètres — c'est en travaillant
 * qu'on s'aperçoit que le sound design vient avant l'étalonnage. Il reste **global** : une
 * étape et une tâche du référentiel n'ont qu'un rang, valable pour toutes les vidéos. Un
 * ordre par vidéo aurait demandé une table de plus pour un besoin que personne n'a
 * exprimé, et deux ordres concurrents finiraient par se contredire. L'écran le dit
 * plutôt que de le laisser deviner.
 */
export const StepTodosDialog = ({ open, onOpenChange, production, step }: StepTodosDialogProps) => {
  const toggleTodo = useToggleTodo();
  const toggleStep = useToggleStep();
  const addTodo = useAddProductionTodo();
  const removeTodo = useDeleteProductionTodo();
  const reorderSteps = useReorderSteps();
  const reorderTodos = useReorderStepTodos();
  const { data: allSteps = [] } = useProductionSteps();
  // Le référentiel complet : réécrire l'ordre demande d'envoyer TOUTES les tâches, pas
  // seulement celles de l'étape ouverte.
  const { data: referential = [] } = useStepTodos();
  const [draft, setDraft] = useState('');

  if (!step) return null;

  const todos = todosOfStep(production.todos, step.id);
  const done = todos.filter((todo) => todo.checked).length;
  const stepChecked = isStepChecked(production, step.id);

  /** Déplace un élément d'un cran et renvoie la liste complète des identifiants. */
  const moved = <T extends { id: string }>(
    list: T[],
    index: number,
    direction: -1 | 1,
  ): string[] => {
    const next = [...list];
    const target = index + direction;
    if (target < 0 || target >= next.length) return [];
    [next[index], next[target]] = [next[target]!, next[index]!];
    return next.map((item) => item.id);
  };

  const stepIndex = allSteps.findIndex((candidate) => candidate.id === step.id);

  const moveStep = (direction: -1 | 1) => {
    const ids = moved(allSteps, stepIndex, direction);
    if (ids.length > 0) reorderSteps.mutate(ids);
  };

  /**
   * Seules les tâches du **référentiel** se réordonnent : les ponctuelles ferment la liste
   * de leur étape par construction (`sortOrder + 1000`), et leur donner un rang ici
   * laisserait croire qu'elles peuvent remonter au-dessus des habituelles.
   */
  const moveTodo = (todoId: string, direction: -1 | 1) => {
    const inStep = referential.filter((todo) => todo.stepId === step.id);
    const index = inStep.findIndex((todo) => todo.id === todoId);
    const reordered = moved(inStep, index, direction);
    if (reordered.length === 0) return;

    const rest = referential.filter((todo) => todo.stepId !== step.id).map((todo) => todo.id);
    reorderTodos.mutate([...reordered, ...rest]);
  };

  const referentialInStep = referential.filter((todo) => todo.stepId === step.id);

  const submitDraft = () => {
    const label = draft.trim();
    if (!label) return;
    addTodo.mutate({ productionId: production.id, label, stepId: step.id });
    // Vidé aussitôt : on note souvent deux ou trois tâches d'affilée.
    setDraft('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md space-y-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: step.color }}
              aria-hidden
            />
            <span className="flex-1">{step.name}</span>

            {/* Déplacer l'étape dans l'ordre général, sans aller dans les paramètres :
                c'est en travaillant qu'on s'aperçoit qu'elle est mal placée. */}
            <span className="flex shrink-0 gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={stepIndex <= 0}
                onClick={() => moveStep(-1)}
                title="Déplacer cette étape avant la précédente (ordre commun à toutes les vidéos)"
              >
                <ChevronUp className="h-3.5 w-3.5" />
                <span className="sr-only">Monter l’étape</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={stepIndex < 0 || stepIndex === allSteps.length - 1}
                onClick={() => moveStep(1)}
                title="Déplacer cette étape après la suivante (ordre commun à toutes les vidéos)"
              >
                <ChevronDown className="h-3.5 w-3.5" />
                <span className="sr-only">Descendre l’étape</span>
              </Button>
            </span>
          </DialogTitle>
          <DialogDescription>
            {todos.length === 0
              ? "Aucune tâche pour cette étape. Ajoute-en une, ou marque l'étape terminée."
              : `${done} tâche(s) faite(s) sur ${todos.length} — « ${production.title} »`}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[45vh] space-y-0.5 overflow-y-auto">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className="group flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-muted/60"
            >
              <button
                type="button"
                onClick={() =>
                  toggleTodo.mutate({
                    productionId: production.id,
                    todoId: todo.id,
                    checked: !todo.checked,
                  })
                }
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                  todo.checked
                    ? 'border-transparent bg-[var(--positive)] text-white'
                    : 'border-border hover:border-foreground',
                )}
                aria-pressed={todo.checked}
              >
                {todo.checked && <Check className="h-3.5 w-3.5" />}
                <span className="sr-only">{todo.checked ? 'Fait' : 'À faire'}</span>
              </button>

              <span
                className={cn(
                  'min-w-0 flex-1 text-sm',
                  todo.checked && 'text-muted-foreground line-through',
                )}
              >
                {todo.label}
                {todo.origin === 'production' && (
                  <span className="ml-1.5 text-[11px] text-muted-foreground">· ponctuelle</span>
                )}
              </span>

              {/* Seules les tâches du référentiel se réordonnent : les ponctuelles ferment
                  la liste de leur étape par construction. */}
              {todo.origin === 'step' && referentialInStep.length > 1 && (
                <span className="flex shrink-0 flex-col opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    className="h-3 text-muted-foreground hover:text-foreground disabled:opacity-20"
                    disabled={referentialInStep[0]?.id === todo.id}
                    onClick={() => moveTodo(todo.id, -1)}
                    title="Monter (ordre commun à toutes les vidéos)"
                  >
                    <ChevronUp className="h-3 w-3" />
                    <span className="sr-only">Monter {todo.label}</span>
                  </button>
                  <button
                    type="button"
                    className="h-3 text-muted-foreground hover:text-foreground disabled:opacity-20"
                    disabled={referentialInStep[referentialInStep.length - 1]?.id === todo.id}
                    onClick={() => moveTodo(todo.id, 1)}
                    title="Descendre (ordre commun à toutes les vidéos)"
                  >
                    <ChevronDown className="h-3 w-3" />
                    <span className="sr-only">Descendre {todo.label}</span>
                  </button>
                </span>
              )}

              {/* Seule une tâche ponctuelle se supprime ici : celles du référentiel
                  appartiennent à toutes les vidéos, elles se gèrent dans les paramètres. */}
              {todo.origin === 'production' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  onClick={() =>
                    removeTodo.mutate({ productionId: production.id, todoId: todo.id })
                  }
                  title="Supprimer cette tâche"
                >
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  <span className="sr-only">Supprimer {todo.label}</span>
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                submitDraft();
              }
            }}
            placeholder="Ajouter une tâche pour cette vidéo…"
            className="h-9"
          />
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={submitDraft}
            disabled={!draft.trim()}
            title="Ajouter"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <Button
          variant={stepChecked ? 'outline' : 'default'}
          className="w-full"
          onClick={() =>
            toggleStep.mutate({
              id: production.id,
              stepId: step.id,
              checked: !stepChecked,
            })
          }
        >
          <CircleCheck className="h-4 w-4" />
          {stepChecked ? `Rouvrir « ${step.name} »` : 'Tout marquer terminé'}
        </Button>
      </DialogContent>
    </Dialog>
  );
};
