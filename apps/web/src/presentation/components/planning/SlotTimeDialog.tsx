import { useState } from 'react';
import { Clock } from 'lucide-react';
import type { ProductionSlot } from '../../../domain/production/entities/ProductionSlot.ts';
import { slotMinutes } from '../../../domain/production/entities/ProductionSlot.ts';
import { formatMinutes, toMinutes, toTime } from '../../../domain/planning/entities/Planning.ts';
import { useUpdateSlot } from '../../../application/production/usecases/useProductions.ts';
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

export interface SlotTimeDialogProps {
  slot: ProductionSlot | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * Corriger l'horaire d'un créneau, au clavier.
 *
 * C'est le **seul geste d'horaire possible sur un créneau approuvé** : celui-ci ne se
 * glisse plus dans la grille, parce qu'il raconte du temps déjà passé et que le déplacer
 * au doigt réécrirait le passé par accident. On se trompe pourtant d'heure en confirmant
 * — approuver à 18 h un montage fait le matin —, et rien ne permettait de le rattraper.
 *
 * **La durée est conservée**, comme au glisser-déposer : on choisit un moment, pas une
 * durée. Sur un créneau approuvé elle est d'ailleurs celle de la session de travail
 * enregistrée ; la changer ici les ferait diverger sans que le compteur de la vidéo
 * bouge. Le temps réellement passé se corrige sur la session, dans la fiche de la vidéo.
 *
 * Le créneau passe en `manual` : on vient de le poser à la main, le prochain
 * « Repositionner » n'a pas à défaire cette décision. Même règle que le glissement.
 */
export const SlotTimeDialog = ({ slot, onOpenChange }: SlotTimeDialogProps) => {
  const update = useUpdateSlot();

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Le formulaire se réarme sur le créneau ouvert pendant le rendu, sans `useEffect` :
  // c'est le pattern des formulaires du projet, et `react-hooks/set-state-in-effect`
  // refuse l'autre.
  const [lastSlotId, setLastSlotId] = useState<string | null>(null);
  if (slot && lastSlotId !== slot.id) {
    setLastSlotId(slot.id);
    setDate(slot.date);
    setStartTime(slot.startTime ?? '09:00');
    setError(null);
  }

  const duration = slot ? slotMinutes(slot) : 0;

  const submit = async () => {
    if (!slot) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
      setError('Renseigne une date et une heure valides.');
      return;
    }
    setError(null);
    try {
      await update.mutateAsync({
        id: slot.id,
        input: {
          date,
          startTime,
          // Sans durée connue, le créneau n'en avait pas : on ne lui en invente pas une.
          endTime: duration > 0 ? toTime(toMinutes(startTime) + duration) : null,
          origin: 'manual',
        },
      });
      onOpenChange(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Correction impossible');
    }
  };

  return (
    <Dialog open={slot !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Changer l’horaire</DialogTitle>
          <DialogDescription>
            {slot?.label || slot?.stepName || slot?.productionTitle} — {slot?.productionTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="slot-date">Jour</Label>
              <Input
                id="slot-date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slot-start">Début</Label>
              <Input
                id="slot-start"
                type="time"
                step={300}
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
              />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            {duration > 0 ? (
              <>
                Durée conservée : {formatMinutes(duration)} — fin à{' '}
                <span className="tabular">
                  {/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)
                    ? toTime(toMinutes(startTime) + duration)
                    : '—'}
                </span>
                .{' '}
                {slot?.done &&
                  'C’est la durée de la session de travail enregistrée : elle se corrige depuis la fiche de la vidéo.'}
              </>
            ) : (
              'Ce créneau n’a pas de durée : seule son heure de début sera posée.'
            )}
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" disabled={update.isPending} onClick={submit}>
            <Clock className="h-4 w-4" />
            {update.isPending ? 'Enregistrement…' : 'Déplacer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
