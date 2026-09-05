import { CheckCircle2, Repeat } from 'lucide-react';
import type { CompletableWork } from '../../../domain/production/entities/TimeEntry.ts';
import {
  useToggleStep,
  useToggleTodo,
} from '../../../application/production/usecases/useProductions.ts';
import { Button } from '../ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';

export interface FinishWorkDialogProps {
  work: CompletableWork | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * « Tu as terminé ? », posée à l'arrêt du chronomètre.
 *
 * C'est la même question que l'approbation d'un créneau, au moment où elle se pose
 * vraiment : on vient de mesurer le temps, on sait si le travail est fini. Elle ne
 * s'ouvre que si la session couvrait une ligne de la pile — un chronomètre lancé depuis
 * une fiche de vidéo n'a rien à clore, et une modale y serait du bruit.
 *
 * **On ne peut pas y répondre à sa place.** Arrêter un chronomètre est souvent une simple
 * pause : cocher d'office ferait disparaître de la pile un travail à moitié fait. Ne rien
 * proposer, en revanche, laissait la ligne traîner jusqu'à ce qu'on aille l'y retirer à la
 * main alors même que le travail était fait — c'est ce que cette modale corrige.
 *
 * Le « oui » ne ferme pas la ligne directement : **il coche la tâche**, et c'est elle qui
 * entraîne le reste (l'étape se coche si c'était la dernière, l'avancement de la vidéo
 * monte, la ligne quitte la pile). La règle vit dans `ManageTodos`, jamais ici.
 */
export const FinishWorkDialog = ({ work, onOpenChange }: FinishWorkDialogProps) => {
  const toggleTodo = useToggleTodo();
  const toggleStep = useToggleStep();
  const busy = toggleTodo.isPending || toggleStep.isPending;

  const finish = () => {
    if (!work) return;
    if (work.todoId) {
      toggleTodo.mutate({ productionId: work.productionId, todoId: work.todoId, checked: true });
    } else if (work.stepId) {
      toggleStep.mutate({ id: work.productionId, stepId: work.stepId, checked: true });
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={work !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tu as terminé ?</DialogTitle>
          <DialogDescription>{work?.label}</DialogDescription>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Le temps est déjà enregistré. Répondre « Terminé » coche la tâche et la retire de la pile
          du planning ; « Pas encore » la laisse, et le prochain replacement lui rendra un créneau.
        </p>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            <Repeat className="h-4 w-4" />
            Pas encore
          </Button>
          <Button type="button" disabled={busy} onClick={finish}>
            <CheckCircle2 className="h-4 w-4" />
            Terminé
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
