import { useState } from 'react';
import { Check, CircleCheck, Plus, Trash2 } from 'lucide-react';
import {
  useAddProductionTodo,
  useDeleteProductionTodo,
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
 */
export const StepTodosDialog = ({ open, onOpenChange, production, step }: StepTodosDialogProps) => {
  const toggleTodo = useToggleTodo();
  const toggleStep = useToggleStep();
  const addTodo = useAddProductionTodo();
  const removeTodo = useDeleteProductionTodo();
  const [draft, setDraft] = useState('');

  if (!step) return null;

  const todos = todosOfStep(production.todos, step.id);
  const done = todos.filter((todo) => todo.checked).length;
  const stepChecked = isStepChecked(production, step.id);

  const submitDraft = () => {
    const label = draft.trim();
    if (!label) return;
    addTodo.mutate({ productionId: production.id, label, stepId: step.id });
    // Vidé aussitôt : on note souvent deux ou trois tâches d'affilée.
    setDraft('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: step.color }}
              aria-hidden
            />
            {step.name}
          </DialogTitle>
          <DialogDescription>
            {todos.length === 0
              ? "Aucune tâche pour cette étape. Ajoute-en une, ou marque l'étape terminée."
              : `${done} tâche(s) faite(s) sur ${todos.length} — « ${production.title} »`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          {todos.map((todo) => (
            <div
              key={todo.id}
              className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/60"
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

        <div className="flex items-center gap-2">
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
