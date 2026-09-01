import { useState } from 'react';
import { useChannels } from '../../../application/channel/usecases/useChannels.ts';
import {
  useCreateProduction,
  useUpdateProduction,
} from '../../../application/production/usecases/useProductions.ts';
import type {
  Production,
  ProductionStatus,
} from '../../../domain/production/entities/Production.ts';
import {
  PRODUCTION_STATUSES,
  STATUS_HINTS,
  STATUS_LABELS,
} from '../../../domain/production/entities/Production.ts';
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

interface ProductionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  production?: Production | null;
}

const EMPTY = {
  title: '',
  channelId: NONE,
  status: 'idea' as ProductionStatus,
  pausedReason: '',
  startDate: '',
  plannedDate: '',
  notes: '',
};

/**
 * Création et édition d'une vidéo en préparation.
 *
 * Le statut « terminée » n'est pas proposé ici : une vidéo devient terminée en étant
 * publiée, c'est-à-dire rattachée à sa sortie réelle. La proposer comme un statut
 * ordinaire produirait des vidéos « terminées » que rien ne relie à YouTube.
 */
export const ProductionDialog = ({ open, onOpenChange, production }: ProductionDialogProps) => {
  const { data: channels = [] } = useChannels();
  const create = useCreateProduction();
  const update = useUpdateProduction();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${production?.id ?? 'new'}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setError(null);
    setForm(
      production
        ? {
            title: production.title,
            channelId: toSelectValue(production.channelId),
            status: production.status,
            pausedReason: production.pausedReason ?? '',
            startDate: production.startDate ?? '',
            plannedDate: production.plannedDate ?? '',
            notes: production.notes ?? '',
          }
        : EMPTY,
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const payload = {
      title: form.title.trim(),
      channelId: fromSelectValue(form.channelId),
      status: form.status,
      // La raison ne survit pas à la sortie de pause : la garder ferait réapparaître
      // un vieux blocage à la prochaine mise en pause.
      pausedReason: form.status === 'paused' ? form.pausedReason.trim() || null : null,
      startDate: form.startDate || null,
      plannedDate: form.plannedDate || null,
      notes: form.notes.trim() || null,
    };

    try {
      if (production) await update.mutateAsync({ id: production.id, input: payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  const pending = create.isPending || update.isPending;
  const statuses = PRODUCTION_STATUSES.filter(
    (status) => status !== 'done' || production?.status === 'done',
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{production ? 'Modifier la vidéo' : 'Nouvelle vidéo'}</DialogTitle>
          <DialogDescription>
            Elle entre en fin de file d'attente. C'est toi qui la remontes — l'outil ne décide
            d'aucune priorité.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="production-title">Titre de travail</Label>
            <Input
              id="production-title"
              placeholder="Le sujet, tel que tu le nommes aujourd'hui"
              value={form.title}
              onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="production-channel">Chaîne</Label>
              <Select
                value={form.channelId}
                onValueChange={(value) => setForm((f) => ({ ...f, channelId: value }))}
              >
                <SelectTrigger id="production-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>À décider</SelectItem>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Ça peut changer jusqu'à la publication.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="production-status">Statut</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, status: value as ProductionStatus }))
                }
              >
                <SelectTrigger id="production-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((status) => (
                    <SelectItem key={status} value={status}>
                      {STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{STATUS_HINTS[form.status]}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="production-start">Début du travail</Label>
              <Input
                id="production-start"
                type="date"
                value={form.startDate}
                onChange={(event) => setForm((f) => ({ ...f, startDate: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="production-planned">Sortie visée</Label>
              <Input
                id="production-planned"
                type="date"
                value={form.plannedDate}
                onChange={(event) => setForm((f) => ({ ...f, plannedDate: event.target.value }))}
              />
            </div>
          </div>

          {form.status === 'paused' && (
            <div className="space-y-1.5">
              <Label htmlFor="production-paused">Qu'est-ce qui bloque ?</Label>
              <Input
                id="production-paused"
                placeholder="J'attends le retour de la marque, le produit n'est pas arrivé…"
                value={form.pausedReason}
                onChange={(event) => setForm((f) => ({ ...f, pausedReason: event.target.value }))}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="production-notes">Notes</Label>
            <Textarea
              id="production-notes"
              placeholder="Angle, références, ce qu'il ne faut pas oublier…"
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
