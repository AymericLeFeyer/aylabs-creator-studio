import { useState } from 'react';
import { DEFAULT_LIVE_MINUTES, type LiveIdea } from '../../../domain/live/entities/LiveIdea.ts';
import {
  useCreateLiveIdea,
  useUpdateLiveIdea,
} from '../../../application/live/usecases/useLiveIdeas.ts';
import { Button } from '../ui/button.tsx';
import { Input, Textarea } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';

/**
 * Noter ou corriger un direct à faire. Seul le titre est obligatoire : la date se pose
 * quand on la connaît, et c'est elle qui fait apparaître le direct dans le planning.
 * `live` à `null` = création.
 */
export const LiveIdeaDialog = ({
  open,
  live,
  onOpenChange,
}: {
  open: boolean;
  live: LiveIdea | null;
  onOpenChange: (open: boolean) => void;
}) => {
  const create = useCreateLiveIdea();
  const update = useUpdateLiveIdea();

  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [minutes, setMinutes] = useState(String(DEFAULT_LIVE_MINUTES));
  const [error, setError] = useState<string | null>(null);

  // Réarmé à l'ouverture, pendant le rendu (pas d'effet : `set-state-in-effect`).
  const key = open ? (live?.id ?? 'new') : null;
  const [lastKey, setLastKey] = useState<string | null>(null);
  if (key !== lastKey) {
    setLastKey(key);
    if (key) {
      setTitle(live?.title ?? '');
      setNotes(live?.notes ?? '');
      setDate(live?.plannedDate ?? '');
      setTime(live?.startTime ?? '');
      setMinutes(String(live?.durationMinutes ?? DEFAULT_LIVE_MINUTES));
      setError(null);
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('Le titre est obligatoire.');
      return;
    }
    const duration = Math.round(Number(minutes));
    if (!Number.isFinite(duration) || duration < 15) {
      setError('Durée : 15 minutes au minimum.');
      return;
    }
    const input = {
      title: title.trim(),
      notes: notes.trim(),
      plannedDate: date || null,
      // Une heure sans jour n'a pas de sens dans le planning.
      startTime: date && time ? time : null,
      durationMinutes: duration,
    };
    try {
      if (live) await update.mutateAsync({ id: live.id, input });
      else await create.mutateAsync(input);
      onOpenChange(false);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{live ? 'Modifier le direct' : 'Nouveau direct'}</DialogTitle>
            <DialogDescription>
              Avec une date, il apparaît dans le planning ; avec une heure, il y occupe sa plage.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="live-title">Titre</Label>
            <Input id="live-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="live-date">Jour</Label>
              <Input
                id="live-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="live-time">Heure</Label>
              <Input
                id="live-time"
                type="time"
                step={300}
                value={time}
                disabled={!date}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="live-minutes">Durée (min)</Label>
              <Input
                id="live-minutes"
                type="number"
                min={15}
                step={15}
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="live-notes">Notes</Label>
            <Textarea
              id="live-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={create.isPending || update.isPending}>
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
