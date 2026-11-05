import { useState } from 'react';
import { usePrepareVideoPosts } from '../../../application/postDraft/usecases/usePostDrafts.ts';
import { shiftDate } from '../../../application/planning/usecases/usePlanning.ts';
import {
  previewVideoPosts,
  VIDEO_POST_KIND_LABELS,
  VIDEO_POST_KINDS,
  type VideoPostKind,
} from '../../../domain/postDraft/entities/PostDraft.ts';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { Button } from '../ui/button.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
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

const longDate = (date: string): string =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

interface PreparePostsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  production: Production;
  /** Publications déjà tirées de cette vidéo : on prévient avant d'en créer d'autres. */
  existingCount: number;
}

/**
 * « Préparer les publications » d'une vidéo terminée : teaser (coché d'office), insert
 * produit, insert sponso. Elles sont posées un jour chacune à partir de la sortie, sans
 * trou — l'aperçu affiche les dates avant de créer. La sortie proposée est la sortie
 * visée avant `videoDate`, pour la même raison que l'annonce Discord.
 */
export const PreparePostsDialog = ({
  open,
  onOpenChange,
  production,
  existingCount,
}: PreparePostsDialogProps) => {
  const prepare = usePrepareVideoPosts();
  const [kinds, setKinds] = useState<VideoPostKind[]>(['teaser']);
  const [releaseDate, setReleaseDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setKinds(['teaser']);
      setReleaseDate(production.plannedDate ?? production.videoDate ?? '');
      setError(null);
    }
  }

  const toggle = (kind: VideoPostKind) =>
    setKinds((current) =>
      current.includes(kind) ? current.filter((entry) => entry !== kind) : [...current, kind],
    );

  const plan = previewVideoPosts(kinds);
  const dateOf = (kind: VideoPostKind): string | null => {
    const entry = plan.find((item) => item.kind === kind);
    return entry && releaseDate ? shiftDate(releaseDate, entry.offset) : null;
  };

  const submit = async () => {
    setError(null);
    try {
      await prepare.mutateAsync({ productionId: production.id, kinds, releaseDate });
      onOpenChange(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Création impossible');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Préparer les publications</DialogTitle>
          <DialogDescription>
            Une publication par jour à partir de la sortie, dans Production → Publications.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="prepare-release">Sortie de la vidéo</Label>
            <Input
              id="prepare-release"
              type="date"
              value={releaseDate}
              onChange={(event) => setReleaseDate(event.target.value)}
            />
          </div>

          <div className="space-y-2">
            {VIDEO_POST_KINDS.map((kind) => {
              const id = `prepare-${kind}`;
              const date = dateOf(kind);
              return (
                <label
                  key={kind}
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm"
                >
                  <Checkbox
                    id={id}
                    checked={kinds.includes(kind)}
                    onCheckedChange={() => toggle(kind)}
                  />
                  <span className="flex-1">{VIDEO_POST_KIND_LABELS[kind]}</span>
                  {date && <span className="text-xs text-muted-foreground">{longDate(date)}</span>}
                </label>
              );
            })}
          </div>

          {existingCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {existingCount === 1
                ? 'Une publication est déjà rattachée à cette vidéo'
                : `${existingCount} publications sont déjà rattachées à cette vidéo`}{' '}
              : celles-ci s'y ajouteront.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={kinds.length === 0 || !releaseDate || prepare.isPending}
            onClick={() => void submit()}
          >
            {kinds.length > 1 ? `Créer ${kinds.length} publications` : 'Créer la publication'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
