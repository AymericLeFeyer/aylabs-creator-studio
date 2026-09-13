import { useState } from 'react';
import { ChevronDown, ChevronLeft, Clock } from 'lucide-react';
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
import { FormatIcon } from '../production/FormatIcon.tsx';
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
 * répondre en arrivant. Puis **sur quoi** travailler, à la maille qu'on veut :
 *
 * - **cocher une étape la retient en bloc** — une seule ligne de pile, dont la durée est
 *   la somme de ses tâches ouvertes. On sait qu'on veut « faire le montage » bien avant
 *   de savoir par quelle sous-étape commencer ;
 * - **« Détailler »** déplie ses tâches pour n'en retenir que certaines (« je fais
 *   l'écriture, mais pas le repérage »), chacune devenant sa propre ligne. Décocher une
 *   tâche d'une étape prise en bloc bascule l'étape dans ce mode.
 *
 * Les étapes sont **repliées par défaut** : le détail est un choix, pas un passage obligé.
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

  /** Étapes retenues **en bloc** : une seule ligne de pile, sans détail des tâches. */
  const [wholeSteps, setWholeSteps] = useState<Set<string>>(new Set());
  /** Tâches retenues une à une, dans les étapes qu'on a choisi de détailler. */
  const [selectedTodos, setSelectedTodos] = useState<Set<string>>(new Set());
  /** Étapes dépliées. Repliées par défaut : le détail est un choix, pas un passage obligé. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const queue = overview?.queue ?? [];
  const todos = production?.todos ?? [];

  const reset = () => {
    setProductionId(null);
    setWholeSteps(new Set());
    setSelectedTodos(new Set());
    setExpanded(new Set());
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

  const openTodosOf = (stepId: string) =>
    todosOfStep(todos, stepId).filter((todo) => !todo.checked);

  /** Durée d'une étape prise en bloc : ses tâches ouvertes, ou sa propre durée. Même règle que l'API. */
  const minutesOfStep = (stepId: string): number => {
    const open = openTodosOf(stepId);
    if (open.length > 0) {
      return open.reduce((sum, todo) => sum + minutesOfTodo(stepId, todo.id), 0);
    }
    const step = steps.find((candidate) => candidate.id === stepId);
    return step?.defaultMinutes ?? FALLBACK_MINUTES;
  };

  const withoutTodosOf = (current: Set<string>, stepId: string) => {
    const next = new Set(current);
    for (const todo of todosOfStep(todos, stepId)) next.delete(todo.id);
    return next;
  };

  /** Cocher une étape la retient en bloc ; le détail éventuel de ses tâches s'efface. */
  const toggleStep = (stepId: string, checked: boolean) => {
    setWholeSteps((current) => {
      const next = new Set(current);
      if (checked) next.add(stepId);
      else next.delete(stepId);
      return next;
    });
    setSelectedTodos((current) => withoutTodosOf(current, stepId));
  };

  /**
   * Toucher une tâche d'une étape prise en bloc la fait passer au détail : ses tâches
   * ouvertes deviennent sélectionnées une à une, puis on applique le geste. Sans ça,
   * retirer une tâche d'une étape entière demanderait de tout décocher et de tout recocher.
   */
  const toggleTodo = (stepId: string, todoId: string, checked: boolean) => {
    const fromWhole = wholeSteps.has(stepId);
    if (fromWhole) {
      setWholeSteps((current) => {
        const next = new Set(current);
        next.delete(stepId);
        return next;
      });
    }
    setSelectedTodos((current) => {
      const next = new Set(current);
      if (fromWhole) for (const todo of openTodosOf(stepId)) next.add(todo.id);
      if (checked) next.add(todoId);
      else next.delete(todoId);
      return next;
    });
  };

  const toggleExpanded = (stepId: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return next;
    });

  /** Le total attendu : la somme des durées de ce qui est coché. */
  const totalMinutes = steps.reduce((sum, step) => {
    if (wholeSteps.has(step.id)) return sum + minutesOfStep(step.id);
    return (
      sum +
      openTodosOf(step.id)
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
        stepIds: [...wholeSteps],
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
                Aucune vidéo en file d’attente. Crée-en une depuis Vidéos ou Shorts &amp; Réels.
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
                  <span className="flex items-center gap-1.5 text-sm font-medium">
                    <FormatIcon
                      format={item.format}
                      className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                    />
                    <span className="truncate">{item.title}</span>
                  </span>
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
                const whole = wholeSteps.has(step.id);
                const picked = open.filter((todo) => selectedTodos.has(todo.id)).length;
                const isExpanded = expanded.has(step.id) && !allDone;

                return (
                  <div
                    key={step.id}
                    className={cn('rounded-md border border-border p-2.5', allDone && 'opacity-50')}
                  >
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`plan-step-${step.id}`}
                        disabled={allDone}
                        checked={whole}
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
                      {!allDone && (stepTodos.length > 0 || step.defaultMinutes !== null) && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatMinutes(minutesOfStep(step.id))}
                        </span>
                      )}
                      {open.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(step.id)}
                          aria-expanded={isExpanded}
                          className="inline-flex shrink-0 items-center gap-0.5 rounded px-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          {picked > 0
                            ? `${picked}/${open.length} tâches`
                            : `Détailler (${open.length})`}
                          <ChevronDown
                            className={cn(
                              'h-3 w-3 transition-transform',
                              isExpanded && 'rotate-180',
                            )}
                          />
                        </button>
                      )}
                      {allDone && <Badge variant="outline">Terminée</Badge>}
                    </div>

                    {isExpanded && (
                      <div className="mt-1.5 space-y-1 border-t border-border pt-1.5 pl-6">
                        {stepTodos.map((todo) => (
                          <div key={todo.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`plan-todo-${todo.id}`}
                              disabled={todo.checked}
                              checked={!todo.checked && (whole || selectedTodos.has(todo.id))}
                              onCheckedChange={(value) =>
                                toggleTodo(step.id, todo.id, value === true)
                              }
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
