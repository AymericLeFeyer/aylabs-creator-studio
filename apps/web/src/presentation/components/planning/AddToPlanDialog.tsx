import { useState } from 'react';
import { ChevronLeft, Clock } from 'lucide-react';
import {
  useProductionOverview,
  useProduction,
  useProductionSteps,
} from '../../../application/production/usecases/useProductions.ts';
import {
  useAddPlanTargets,
  localToday,
  nowMinutes,
} from '../../../application/planning/usecases/usePlanning.ts';
import { formatMinutes } from '../../../domain/planning/entities/Planning.ts';
import { todosOfStep } from '../../../domain/production/entities/StepTodo.ts';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { cn } from '../../../shared/cn.ts';

/** Durée retenue quand ni la tâche ni son étape n'en donnent une. Même valeur que l'API. */
const FALLBACK_MINUTES = 60;

export interface AddToPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * « Ajouter une vidéo au planning », en deux temps.
 *
 * D'abord la vidéo, prise dans la file d'attente — c'est la question à laquelle on sait
 * répondre en arrivant. Puis **sur quoi** travailler : les étapes, chacune dépliée en
 * ses tâches. Cocher une étape coche ses tâches ; en décocher une laisse l'étape
 * partiellement retenue, ce qui est le cas normal (« je fais l'écriture, mais pas le
 * repérage »).
 *
 * Tout ce qui est **déjà coché sur la vidéo** est affiché grisé et non sélectionnable :
 * planifier du travail terminé remplirait l'agenda de séances sans objet.
 *
 * Le total attendu s'affiche en bas, en continu : c'est ce qui permet de savoir qu'on
 * vient de demander onze heures avant de cliquer, et pas après.
 */
export const AddToPlanDialog = ({ open, onOpenChange }: AddToPlanDialogProps) => {
  const { data: overview } = useProductionOverview();
  const { data: steps = [] } = useProductionSteps();
  const [productionId, setProductionId] = useState<string | null>(null);
  const { data: production } = useProduction(productionId ?? undefined);
  const add = useAddPlanTargets();

  const [selectedSteps, setSelectedSteps] = useState<Set<string>>(new Set());
  const [selectedTodos, setSelectedTodos] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const queue = overview?.queue ?? [];
  const todos = production?.todos ?? [];

  const reset = () => {
    setProductionId(null);
    setSelectedSteps(new Set());
    setSelectedTodos(new Set());
    setError(null);
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const minutesOfTodo = (stepId: string, todoId: string): number => {
    const step = steps.find((candidate) => candidate.id === stepId);
    const todo = todos.find((candidate) => candidate.id === todoId);
    return todo?.defaultMinutes ?? step?.defaultMinutes ?? FALLBACK_MINUTES;
  };

  /** Cocher une étape entraîne ses tâches non faites : c'est le geste attendu. */
  const toggleStep = (stepId: string, checked: boolean) => {
    setSelectedSteps((current) => {
      const next = new Set(current);
      if (checked) next.add(stepId);
      else next.delete(stepId);
      return next;
    });
    setSelectedTodos((current) => {
      const next = new Set(current);
      for (const todo of todosOfStep(todos, stepId)) {
        if (todo.checked) continue;
        if (checked) next.add(todo.id);
        else next.delete(todo.id);
      }
      return next;
    });
  };

  const toggleTodo = (todoId: string, checked: boolean) => {
    setSelectedTodos((current) => {
      const next = new Set(current);
      if (checked) next.add(todoId);
      else next.delete(todoId);
      return next;
    });
  };

  /** Le total attendu : la somme des durées de ce qui est coché. */
  const totalMinutes = steps.reduce((sum, step) => {
    const stepTodos = todosOfStep(todos, step.id).filter((todo) => !todo.checked);
    if (stepTodos.length === 0) {
      return selectedSteps.has(step.id) ? sum + (step.defaultMinutes ?? FALLBACK_MINUTES) : sum;
    }
    return (
      sum +
      stepTodos
        .filter((todo) => selectedTodos.has(todo.id))
        .reduce((inner, todo) => inner + minutesOfTodo(step.id, todo.id), 0)
    );
  }, 0);

  const submit = async () => {
    if (!productionId) return;
    setError(null);
    try {
      await add.mutateAsync({
        productionId,
        stepIds: [...selectedSteps],
        todoIds: [...selectedTodos],
        from: localToday(),
        nowMinutes: nowMinutes(),
      });
      close(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Ajout impossible');
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {productionId ? 'Sur quoi travailler ?' : 'Ajouter une vidéo au planning'}
          </DialogTitle>
          <DialogDescription>
            {productionId
              ? 'Ce qui est coché entre dans la pile et reçoit des créneaux, dans cet ordre.'
              : 'Les vidéos encore à faire, dans l’ordre de ta file d’attente.'}
          </DialogDescription>
        </DialogHeader>

        {!productionId && (
          <div className="space-y-1">
            {queue.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Aucune vidéo en file d’attente. Crée-en une depuis l’écran Production.
              </p>
            )}
            {queue.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setProductionId(item.id)}
                className="flex w-full items-center gap-2.5 rounded-md border border-border px-3 py-2 text-left transition-colors hover:bg-accent"
              >
                <span
                  className="h-8 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.channelColor ?? '#64748b' }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {item.channelName ?? 'Sans chaîne'}
                    {item.plannedDate ? ` · sortie visée le ${item.plannedDate}` : ''}
                  </span>
                </span>
                {item.status === 'paused' && <Badge variant="outline">En pause</Badge>}
              </button>
            ))}
          </div>
        )}

        {productionId && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setProductionId(null)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3 w-3" />
              {production?.title ?? 'Changer de vidéo'}
            </button>

            <div className="space-y-2">
              {steps.map((step) => {
                const stepTodos = todosOfStep(todos, step.id);
                const open = stepTodos.filter((todo) => !todo.checked);
                const allDone = stepTodos.length > 0 && open.length === 0;

                return (
                  <div
                    key={step.id}
                    className={cn('rounded-md border border-border p-2.5', allDone && 'opacity-50')}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`plan-step-${step.id}`}
                        disabled={allDone}
                        checked={
                          stepTodos.length === 0
                            ? selectedSteps.has(step.id)
                            : open.length > 0 && open.every((todo) => selectedTodos.has(todo.id))
                        }
                        onCheckedChange={(value) => toggleStep(step.id, value === true)}
                      />
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: step.color }}
                        aria-hidden
                      />
                      <label
                        htmlFor={`plan-step-${step.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium"
                      >
                        {step.name}
                      </label>
                      {step.defaultMinutes !== null && stepTodos.length === 0 && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatMinutes(step.defaultMinutes)}
                        </span>
                      )}
                      {allDone && <Badge variant="outline">Terminée</Badge>}
                    </div>

                    {stepTodos.length > 0 && (
                      <div className="mt-1.5 space-y-1 border-t border-border pt-1.5 pl-6">
                        {stepTodos.map((todo) => (
                          <div key={todo.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`plan-todo-${todo.id}`}
                              disabled={todo.checked}
                              checked={selectedTodos.has(todo.id)}
                              onCheckedChange={(value) => toggleTodo(todo.id, value === true)}
                            />
                            <label
                              htmlFor={`plan-todo-${todo.id}`}
                              className={cn(
                                'min-w-0 flex-1 truncate text-sm',
                                todo.checked && 'text-muted-foreground line-through',
                              )}
                            >
                              {todo.label}
                            </label>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {formatMinutes(minutesOfTodo(step.id, todo.id))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            {totalMinutes === 0 ? 'Rien de sélectionné' : `${formatMinutes(totalMinutes)} à caler`}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Annuler
            </Button>
            <Button
              type="button"
              disabled={!productionId || totalMinutes === 0 || add.isPending}
              onClick={submit}
            >
              {add.isPending ? 'Placement…' : 'Placer dans l’agenda'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
