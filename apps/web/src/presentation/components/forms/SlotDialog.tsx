import { useState } from 'react';
import {
  useCreateSlot,
  useProductionSteps,
  useUpdateSlot,
} from '../../../application/production/usecases/useProductions.ts';
import type { ProductionSlot } from '../../../domain/production/entities/ProductionSlot.ts';
import { toIsoDate } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { Input, Textarea } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { fromSelectValue, NONE, toSelectValue } from './selectNone.ts';

interface SlotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productionId: string;
  slot?: ProductionSlot | null;
}

/**
 * Un créneau de travail. Les heures sont facultatives : « samedi » est un créneau
 * parfaitement valable, et les exiger ferait renoncer à en poser un.
 */
export const SlotDialog = ({ open, onOpenChange, productionId, slot }: SlotDialogProps) => {
  const { data: steps = [] } = useProductionSteps();
  const create = useCreateSlot();
  const update = useUpdateSlot();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    stepId: NONE,
    date: toIsoDate(new Date()),
    startTime: '',
    endTime: '',
    label: '',
    notes: '',
  });

  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${slot?.id ?? 'new'}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setError(null);
    setForm({
      stepId: toSelectValue(slot?.stepId),
      date: slot?.date ?? toIsoDate(new Date()),
      startTime: slot?.startTime ?? '',
      endTime: slot?.endTime ?? '',
      label: slot?.label ?? '',
      notes: slot?.notes ?? '',
    });
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (form.startTime && form.endTime && form.endTime <= form.startTime) {
      setError("L'heure de fin doit être après celle de début.");
      return;
    }

    const payload = {
      stepId: fromSelectValue(form.stepId),
      date: form.date,
      startTime: form.startTime || null,
      endTime: form.endTime || null,
      label: form.label.trim(),
      notes: form.notes.trim() || null,
    };

    try {
      if (slot) await update.mutateAsync({ id: slot.id, input: payload });
      else await create.mutateAsync({ ...payload, productionId });
      onOpenChange(false);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{slot ? 'Modifier le créneau' : 'Nouveau créneau'}</DialogTitle>
          <DialogDescription>
            Les heures sont facultatives. Renseignées, elles comptent dans la charge de travail de
            la semaine.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="slot-date">Date</Label>
              <Input
                id="slot-date"
                type="date"
                value={form.date}
                onChange={(event) => setForm((f) => ({ ...f, date: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slot-start">Début</Label>
              <Input
                id="slot-start"
                type="time"
                value={form.startTime}
                onChange={(event) => setForm((f) => ({ ...f, startTime: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slot-end">Fin</Label>
              <Input
                id="slot-end"
                type="time"
                value={form.endTime}
                onChange={(event) => setForm((f) => ({ ...f, endTime: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slot-step">Étape visée</Label>
            <Select
              value={form.stepId}
              onValueChange={(value) => setForm((f) => ({ ...f, stepId: value }))}
            >
              <SelectTrigger id="slot-step">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sans étape précise</SelectItem>
                {steps.map((step) => (
                  <SelectItem key={step.id} value={step.id}>
                    {step.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slot-label">Intitulé</Label>
            <Input
              id="slot-label"
              placeholder="Facultatif : « finir la B-roll », « relire le script »…"
              value={form.label}
              onChange={(event) => setForm((f) => ({ ...f, label: event.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="slot-notes">Notes</Label>
            <Textarea
              id="slot-notes"
              value={form.notes}
              onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
