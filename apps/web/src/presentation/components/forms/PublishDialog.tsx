import { useMemo, useState } from 'react';
import { usePublishProduction } from '../../../application/production/usecases/useProductions.ts';
import { useVideos } from '../../../application/video/usecases/useVideos.ts';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { formatDate } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { Label } from '../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';

interface PublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  production: Production;
  /** Appelé après un rattachement réussi. C'est le seul moment de l'outil qui se fête. */
  onPublished?: () => void;
}

/**
 * Rattache la production à la sortie réelle collectée sur YouTube.
 *
 * Les vidéos sont triées par proximité avec la date visée plutôt que par date : celle
 * qu'on cherche est presque toujours celle qui est sortie près du jour prévu, et elle
 * doit se trouver en tête sans avoir à faire défiler des mois d'historique.
 */
export const PublishDialog = ({
  open,
  onOpenChange,
  production,
  onPublished,
}: PublishDialogProps) => {
  const { data: videos = [], isLoading } = useVideos();
  const publish = usePublishProduction();
  const [videoId, setVideoId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [lastKey, setLastKey] = useState<string | null>(null);
  if (open && lastKey !== production.id) {
    setLastKey(production.id);
    setVideoId(production.videoId ?? '');
    setError(null);
  }

  const options = useMemo(() => {
    const reference = Date.parse(
      `${production.plannedDate ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`,
    );
    return videos
      .filter((video) => !production.channelId || video.channelId === production.channelId)
      .map((video) => ({ video, gap: Math.abs(Date.parse(`${video.date}T00:00:00Z`) - reference) }))
      .sort((a, b) => a.gap - b.gap)
      .slice(0, 50)
      .map((match) => match.video);
  }, [videos, production.channelId, production.plannedDate]);

  const submit = async () => {
    setError(null);
    if (!videoId) {
      setError('Choisis la sortie correspondante.');
      return;
    }
    try {
      await publish.mutateAsync({ id: production.id, videoId });
      onOpenChange(false);
      onPublished?.();
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Rattachement impossible');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marquer « {production.title} » comme publiée</DialogTitle>
          <DialogDescription>
            La vidéo quitte la file d'attente et rejoint les terminées. Son script, ses créneaux et
            son argent restent consultables — rien n'est supprimé.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="publish-video">Sortie correspondante</Label>
          <Select value={videoId} onValueChange={setVideoId}>
            <SelectTrigger id="publish-video">
              <SelectValue placeholder="Choisir la vidéo" />
            </SelectTrigger>
            <SelectContent>
              {options.map((video) => (
                <SelectItem key={video.id} value={video.id}>
                  {formatDate(video.date)} · {video.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {isLoading
              ? 'Chargement des sorties…'
              : options.length === 0
                ? 'Aucune sortie connue pour cette chaîne. Les vidéos arrivent avec la collecte.'
                : "Triées par proximité avec la date visée. L'étape de publication sera cochée."}
          </p>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => void submit()} disabled={publish.isPending}>
            {publish.isPending ? 'Rattachement…' : 'Marquer publiée'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
