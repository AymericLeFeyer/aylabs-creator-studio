import { useState } from 'react';
import {
  useSaveManualMetrics,
  useSaveManualSnapshot,
} from '../../../application/channel/usecases/useChannels.ts';
import type { Channel } from '../../../domain/channel/entities/Channel.ts';
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
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs.tsx';

interface ManualEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: Channel | null;
}

const numeric = (value: string): number => {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Saisie manuelle pour une chaîne : soit les chiffres d'une journée (flux),
 * soit un total d'abonnés à une date (cumul).
 *
 * Une journée saisie ici est marquée `manual` côté API et ne sera jamais écrasée
 * par une collecte automatique ultérieure.
 */
export const ManualEntryDialog = ({ open, onOpenChange, channel }: ManualEntryDialogProps) => {
  const saveMetrics = useSaveManualMetrics();
  const saveSnapshot = useSaveManualSnapshot();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [daily, setDaily] = useState({
    date: toIsoDate(new Date()),
    views: '',
    watchMinutes: '',
    subscribersGained: '',
    subscribersLost: '',
    likes: '',
    comments: '',
    shares: '',
    estimatedRevenue: '',
  });

  const [snapshot, setSnapshot] = useState({
    date: toIsoDate(new Date()),
    subscribers: '',
    totalViews: '',
    totalVideos: '',
  });

  if (!channel) return null;

  const submitDaily = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setDone(null);
    try {
      await saveMetrics.mutateAsync({
        id: channel.id,
        input: {
          date: daily.date,
          views: Math.round(numeric(daily.views)),
          watchMinutes: numeric(daily.watchMinutes),
          subscribersGained: Math.round(numeric(daily.subscribersGained)),
          subscribersLost: Math.round(numeric(daily.subscribersLost)),
          likes: Math.round(numeric(daily.likes)),
          comments: Math.round(numeric(daily.comments)),
          shares: Math.round(numeric(daily.shares)),
          estimatedRevenue: numeric(daily.estimatedRevenue),
        },
      });
      setDone(`Journée du ${daily.date} enregistrée.`);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  const submitSnapshot = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setDone(null);
    try {
      await saveSnapshot.mutateAsync({
        id: channel.id,
        input: {
          date: snapshot.date,
          subscribers: Math.round(numeric(snapshot.subscribers)),
          totalViews: Math.round(numeric(snapshot.totalViews)),
          totalVideos: Math.round(numeric(snapshot.totalVideos)),
        },
      });
      setDone(`Total d'abonnés du ${snapshot.date} enregistré.`);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  const field = (
    id: string,
    label: string,
    value: string,
    onChange: (value: string) => void,
    step = '1',
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      <Input
        id={id}
        type="number"
        step={step}
        min="0"
        inputMode="decimal"
        placeholder="0"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Saisie manuelle — {channel.name}</DialogTitle>
          <DialogDescription>
            Une journée saisie ici ne sera jamais écrasée par une collecte automatique.
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="daily">
          <TabsList className="w-full">
            <TabsTrigger value="daily" className="flex-1">
              Journée
            </TabsTrigger>
            <TabsTrigger value="snapshot" className="flex-1">
              Total abonnés
            </TabsTrigger>
          </TabsList>

          <TabsContent value="daily">
            <form onSubmit={submitDaily} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="manual-date">Date</Label>
                <Input
                  id="manual-date"
                  type="date"
                  value={daily.date}
                  onChange={(event) => setDaily((d) => ({ ...d, date: event.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {field('m-views', 'Vues', daily.views, (v) =>
                  setDaily((d) => ({ ...d, views: v })),
                )}
                {field('m-watch', 'Minutes vues', daily.watchMinutes, (v) =>
                  setDaily((d) => ({ ...d, watchMinutes: v })),
                )}
                {field(
                  'm-rev',
                  'Revenu (€)',
                  daily.estimatedRevenue,
                  (v) => setDaily((d) => ({ ...d, estimatedRevenue: v })),
                  '0.01',
                )}
                {field('m-gain', 'Abonnés gagnés', daily.subscribersGained, (v) =>
                  setDaily((d) => ({ ...d, subscribersGained: v })),
                )}
                {field('m-lost', 'Abonnés perdus', daily.subscribersLost, (v) =>
                  setDaily((d) => ({ ...d, subscribersLost: v })),
                )}
                {field('m-likes', 'Likes', daily.likes, (v) =>
                  setDaily((d) => ({ ...d, likes: v })),
                )}
                {field('m-comments', 'Commentaires', daily.comments, (v) =>
                  setDaily((d) => ({ ...d, comments: v })),
                )}
                {field('m-shares', 'Partages', daily.shares, (v) =>
                  setDaily((d) => ({ ...d, shares: v })),
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {done && <p className="text-sm text-[var(--positive)]">{done}</p>}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Fermer
                </Button>
                <Button type="submit" disabled={saveMetrics.isPending}>
                  {saveMetrics.isPending ? 'Enregistrement…' : 'Enregistrer la journée'}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>

          <TabsContent value="snapshot">
            <form onSubmit={submitSnapshot} className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Utile pour amorcer la courbe d'abonnés cumulés avant la première collecte.
              </p>

              <div className="space-y-1.5">
                <Label htmlFor="snap-date">Date</Label>
                <Input
                  id="snap-date"
                  type="date"
                  value={snapshot.date}
                  onChange={(event) => setSnapshot((s) => ({ ...s, date: event.target.value }))}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {field('s-subs', 'Abonnés', snapshot.subscribers, (v) =>
                  setSnapshot((s) => ({ ...s, subscribers: v })),
                )}
                {field('s-views', 'Vues totales', snapshot.totalViews, (v) =>
                  setSnapshot((s) => ({ ...s, totalViews: v })),
                )}
                {field('s-videos', 'Nb vidéos', snapshot.totalVideos, (v) =>
                  setSnapshot((s) => ({ ...s, totalVideos: v })),
                )}
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}
              {done && <p className="text-sm text-[var(--positive)]">{done}</p>}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Fermer
                </Button>
                <Button type="submit" disabled={saveSnapshot.isPending}>
                  {saveSnapshot.isPending ? 'Enregistrement…' : 'Enregistrer le total'}
                </Button>
              </DialogFooter>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
