import { useState } from 'react';
import { Play } from 'lucide-react';
import {
  useProductionSteps,
  useStartTimer,
} from '../../../application/production/usecases/useProductions.ts';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { isStepChecked } from '../../../domain/production/entities/Production.ts';
import { todosOfStep } from '../../../domain/production/entities/StepTodo.ts';
import { formatMinutes } from '../../../domain/planning/entities/Planning.ts';
import { Button } from '../ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { cn } from '../../../shared/cn.ts';

interface StartTimerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  production: Production | null;
}

/**
 * Le choix de l'étape — et de la sous-étape — au démarrage du chronomètre.
 *
 * On demande **avant** de lancer et non après : un temps non qualifié ne se rattrape
 * pas — au moment de l'arrêt, on ne sait déjà plus si l'heure passée était de l'écriture
 * ou du montage, et c'est justement la question à laquelle ce suivi doit répondre.
 *
 * La sous-étape est la maille qui apprend vraiment quelque chose : « le montage me prend
 * deux fois plus que je ne le crois » se lit déjà à l'étape, mais « c'est le sound design
 * qui mange le montage » ne se lit nulle part ailleurs. C'est aussi la maille sur laquelle
 * le planning réserve du temps, donc la seule qui permette de comparer l'estimation au
 * vécu. Elle reste **facultative** : mieux vaut un temps mal rangé qu'un temps jamais
 * mesuré.
 *
 * Les étapes et tâches déjà cochées restent proposées, simplement estompées : on revient
 * souvent sur un montage qu'on croyait terminé.
 */
export const StartTimerDialog = ({ open, onOpenChange, production }: StartTimerDialogProps) => {
  const { data: steps = [] } = useProductionSteps();
  const start = useStartTimer();
  const [stepId, setStepId] = useState<string | null>(null);
  const [todoId, setTodoId] = useState<string | null>(null);

  // La première étape non cochée est le pari le plus sûr : c'est là qu'on en est.
  // Recalculé à chaque ouverture, pendant le rendu — même pattern que les formulaires
  // du projet, sinon la modale afficherait l'étape de la vidéo précédente.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${production?.id ?? 'none'}`;
  if (open && production && key !== lastKey) {
    setLastKey(key);
    const next = steps.find((step) => !isStepChecked(production, step.id));
    setStepId(next?.id ?? steps[0]?.id ?? null);
    setTodoId(null);
  }

  if (!production) return null;

  const todos = stepId ? todosOfStep(production.todos, stepId) : [];
  const step = steps.find((candidate) => candidate.id === stepId);

  const submit = () => {
    start.mutate(
      { productionId: production.id, stepId, todoId },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Démarrer le chronomètre</DialogTitle>
          <DialogDescription>
            Sur quoi travailles-tu, pour « {production.title} » ?
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1.5">
          {steps.map((candidate) => {
            const selected = stepId === candidate.id;
            const done = isStepChecked(production, candidate.id);
            return (
              <button
                key={candidate.id}
                type="button"
                onClick={() => {
                  // Changer d'étape remet la sous-étape à zéro : une tâche de montage
                  // n'a aucun sens sous « écriture ».
                  setStepId(candidate.id);
                  setTodoId(null);
                }}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  selected
                    ? 'border-transparent text-white'
                    : 'border-border text-muted-foreground hover:text-foreground',
                  !selected && done && 'opacity-50',
                )}
                style={selected ? { backgroundColor: candidate.color } : undefined}
              >
                {candidate.name}
              </button>
            );
          })}

          {/* Chronométrer sans qualifier reste possible : mieux vaut un temps mal rangé
              qu'un temps jamais mesuré. */}
          <button
            type="button"
            onClick={() => {
              setStepId(null);
              setTodoId(null);
            }}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
              stepId === null
                ? 'border-foreground text-foreground'
                : 'border-dashed border-border text-muted-foreground hover:text-foreground',
            )}
          >
            Sans étape
          </button>
        </div>

        {/* La sous-étape n'apparaît que si l'étape en a : une liste vide sous chaque
            étape ferait croire qu'il manque quelque chose à configurer. */}
        {todos.length > 0 && (
          <div className="space-y-1.5 border-t border-border pt-3">
            <p className="text-xs font-medium text-muted-foreground">
              Précisément, dans « {step?.name} » ?
            </p>
            <div className="flex flex-wrap gap-1.5">
              {todos.map((todo) => {
                const selected = todoId === todo.id;
                return (
                  <button
                    key={todo.id}
                    type="button"
                    onClick={() => setTodoId(selected ? null : todo.id)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      selected
                        ? 'border-transparent text-white'
                        : 'border-border text-muted-foreground hover:text-foreground',
                      !selected && todo.checked && 'opacity-50 line-through',
                    )}
                    style={selected ? { backgroundColor: step?.color } : undefined}
                  >
                    {todo.label}
                    {todo.defaultMinutes !== null && (
                      <span className="ml-1 opacity-70">
                        · {formatMinutes(todo.defaultMinutes)}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Facultatif — l’étape seule suffit à ranger le temps.
            </p>
          </div>
        )}

        {steps.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Aucune étape configurée. Le temps sera enregistré sans étape.
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={start.isPending}>
            <Play className="h-4 w-4" />
            Démarrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
