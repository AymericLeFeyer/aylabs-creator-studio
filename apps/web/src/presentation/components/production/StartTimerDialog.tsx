import { useState } from 'react';
import { Play } from 'lucide-react';
import {
  useProductionSteps,
  useStartTimer,
} from '../../../application/production/usecases/useProductions.ts';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { isStepChecked } from '../../../domain/production/entities/Production.ts';
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
 * Le choix de l'étape au démarrage du chronomètre.
 *
 * On demande **avant** de lancer et non après : un temps non qualifié ne se rattrape
 * pas — au moment de l'arrêt, on ne sait déjà plus si l'heure passée était de l'écriture
 * ou du montage, et c'est justement la question à laquelle ce suivi doit répondre.
 *
 * Les étapes déjà cochées restent proposées, simplement estompées : on revient souvent
 * sur un montage qu'on croyait terminé.
 */
export const StartTimerDialog = ({ open, onOpenChange, production }: StartTimerDialogProps) => {
  const { data: steps = [] } = useProductionSteps();
  const start = useStartTimer();
  const [stepId, setStepId] = useState<string | null>(null);

  // La première étape non cochée est le pari le plus sûr : c'est là qu'on en est.
  // Recalculé à chaque ouverture, pendant le rendu — même pattern que les formulaires
  // du projet, sinon la modale afficherait l'étape de la vidéo précédente.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${production?.id ?? 'none'}`;
  if (open && production && key !== lastKey) {
    setLastKey(key);
    const next = steps.find((step) => !isStepChecked(production, step.id));
    setStepId(next?.id ?? steps[0]?.id ?? null);
  }

  if (!production) return null;

  const submit = () => {
    start.mutate({ productionId: production.id, stepId }, { onSuccess: () => onOpenChange(false) });
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
          {steps.map((step) => {
            const selected = stepId === step.id;
            const done = isStepChecked(production, step.id);
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setStepId(step.id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                  selected
                    ? 'border-transparent text-white'
                    : 'border-border text-muted-foreground hover:text-foreground',
                  !selected && done && 'opacity-50',
                )}
                style={selected ? { backgroundColor: step.color } : undefined}
              >
                {step.name}
              </button>
            );
          })}

          {/* Chronométrer sans qualifier reste possible : mieux vaut un temps mal rangé
              qu'un temps jamais mesuré. */}
          <button
            type="button"
            onClick={() => setStepId(null)}
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
