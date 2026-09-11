import { useState } from 'react';
import { CheckCircle2, Repeat } from 'lucide-react';
import type { ProductionSlot } from '../../../domain/production/entities/ProductionSlot.ts';
import { slotMinutes } from '../../../domain/production/entities/ProductionSlot.ts';
import { formatMinutes } from '../../../domain/planning/entities/Planning.ts';
import {
  localToday,
  nowMinutes,
  useApproveSlot,
} from '../../../application/planning/usecases/usePlanning.ts';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';

export interface ApproveSlotDialogProps {
  slot: ProductionSlot | null;
  onOpenChange: (open: boolean) => void;
}

/** Durée proposée pour un créneau posé sans horaire : il n'en porte aucune. */
const DEFAULT_MINUTES_WITHOUT_HOURS = 60;

/** L'heure pleine courante, en `HH:MM` — le défaut le moins faux pour un créneau sans horaire. */
const currentHour = (): string => `${String(new Date().getHours()).padStart(2, '0')}:00`;

/**
 * « J'ai passé ce temps là-dessus. »
 *
 * **Approuver n'est pas terminer**, et c'est toute la raison d'être de cette modale :
 * on confirme le temps passé, puis on répond à la seule question qui reste — est-ce
 * fini ? Si non, un créneau de même durée est reposé ailleurs, et la tâche reste dans
 * la pile. Répondre à la place de l'utilisateur ferait disparaître de la pile un travail
 * à moitié fait, ou l'y laisserait éternellement.
 *
 * La question n'est posée que pour un créneau **issu de la pile** (`itemId`) : un créneau
 * prévu depuis une fiche n'a aucune ligne à fermer, et « Pas encore » n'y aurait rien à
 * reposer. Il se valide alors d'un seul bouton.
 *
 * La durée est **modifiable** : on a rarement travaillé exactement le temps prévu, et
 * c'est ce chiffre-là qui alimente le compteur de la vidéo. Un créneau posé **sans
 * horaire** (« samedi ») demande en plus l'heure où l'on s'y est mis : sans elle, il
 * n'aurait aucune place dans la journée ni dans l'agenda.
 */
export const ApproveSlotDialog = ({ slot, onOpenChange }: ApproveSlotDialogProps) => {
  const approve = useApproveSlot();
  const planned = slot ? slotMinutes(slot) : 0;
  const withoutHours = slot !== null && !slot.startTime;
  const fromQueue = slot?.itemId != null;
  const [minutes, setMinutes] = useState<string>('');
  const [startTime, setStartTime] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Le champ se réarme sur le créneau ouvert, sans effet : c'est le pattern des
  // formulaires du projet, et un `useEffect` déclencherait un rendu de plus.
  const [lastSlotId, setLastSlotId] = useState<string | null>(null);
  if (slot && lastSlotId !== slot.id) {
    setLastSlotId(slot.id);
    setMinutes(String(planned > 0 ? planned : DEFAULT_MINUTES_WITHOUT_HOURS));
    setStartTime(slot.startTime ?? currentHour());
    setError(null);
  }

  const submit = async (finished: boolean) => {
    if (!slot) return;
    setError(null);
    const parsed = Number(minutes);
    try {
      await approve.mutateAsync({
        slotId: slot.id,
        finished,
        minutes: Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined,
        startTime: withoutHours ? startTime : undefined,
        from: localToday(),
        nowMinutes: nowMinutes(),
      });
      onOpenChange(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Approbation impossible');
    }
  };

  return (
    <Dialog open={slot !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Valider le temps passé</DialogTitle>
          <DialogDescription>
            {slot?.label || slot?.stepName || slot?.productionTitle} — {slot?.date}
            {slot?.startTime && ` ${slot.startTime} → ${slot.endTime}`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {withoutHours && (
            <div className="space-y-1.5">
              <Label htmlFor="approve-start">Heure de début</Label>
              <Input
                id="approve-start"
                type="time"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="approve-minutes">Durée réellement passée (minutes)</Label>
            <Input
              id="approve-minutes"
              type="number"
              min={1}
              max={24 * 60}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {planned > 0 ? `Prévu : ${formatMinutes(planned)}. ` : ''}Ce chiffre alimente le
              compteur de temps de la vidéo.
            </p>
          </div>

          {fromQueue && (
            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-sm font-medium">Tu as terminé cette tâche ?</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Si non, un créneau de la même durée est reposé au plus tôt, en gardant l’ordre. Le
                créneau que tu viens d’approuver, lui, ne bougera plus.
              </p>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <div className="flex gap-2">
            {fromQueue && (
              <Button
                type="button"
                variant="secondary"
                disabled={approve.isPending}
                onClick={() => submit(false)}
              >
                <Repeat className="h-4 w-4" />
                Pas encore
              </Button>
            )}
            <Button
              type="button"
              disabled={approve.isPending || (withoutHours && !startTime)}
              onClick={() => submit(true)}
            >
              <CheckCircle2 className="h-4 w-4" />
              {approve.isPending ? 'Enregistrement…' : fromQueue ? 'Terminé' : 'Valider'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
