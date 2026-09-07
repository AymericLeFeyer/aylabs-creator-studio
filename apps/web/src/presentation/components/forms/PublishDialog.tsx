import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePublishProduction } from '../../../application/production/usecases/useProductions.ts';
import { useCollectAll } from '../../../application/analytics/usecases/useAnalytics.ts';
import { useCollectChannel } from '../../../application/channel/usecases/useChannels.ts';
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
 *
 * **Le bouton de collecte est ici parce qu'il n'est nulle part ailleurs.** On vient de
 * mettre la vidéo en ligne et on marque la production publiée dans la foulée : si aucune
 * collecte n'a tourné depuis, la sortie n'existe pas encore en base et la liste est vide.
 * Or `/production/:id` n'a pas de barre de filtres, donc pas de bouton « Collecter » —
 * il fallait aller sur un autre écran, collecter, puis revenir. La collecte d'une seule
 * chaîne suffit quand la production en a une, et elle coûte bien moins qu'un passage
 * complet.
 */
export const PublishDialog = ({
  open,
  onOpenChange,
  production,
  onPublished,
}: PublishDialogProps) => {
  const { data: videos = [], isLoading } = useVideos();
  const publish = usePublishProduction();
  // Les deux chemins invalident `videos` (`COLLECT_ROOTS`) : la liste se remplit toute
  // seule au retour, sans que le formulaire ait à s'en occuper.
  const collectChannel = useCollectChannel();
  const collectAll = useCollectAll();
  const collecting = collectChannel.isPending || collectAll.isPending;
  const collect = () =>
    production.channelId ? collectChannel.mutate(production.channelId) : collectAll.mutate();
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {isLoading
                ? 'Chargement des sorties…'
                : options.length === 0
                  ? 'Aucune sortie connue pour cette chaîne. Les vidéos arrivent avec la collecte.'
                  : "Triées par proximité avec la date visée. L'étape de publication sera cochée."}
            </p>
            {/* Discret, mais toujours là : la sortie manquante est presque toujours celle
                qu'on vient de mettre en ligne, et rien d'autre sur cet écran ne permet
                d'aller la chercher. */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={collecting}
              onClick={collect}
              title="Va chercher les dernières sorties sur YouTube"
            >
              <RefreshCw className={collecting ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
              {collecting ? 'Collecte…' : 'Chercher les nouvelles sorties'}
            </Button>
          </div>
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
