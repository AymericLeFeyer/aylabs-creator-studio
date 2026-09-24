import { Eye } from 'lucide-react';
import { useSetVideoHidden, useVideos } from '../../../application/video/usecases/useVideos.ts';
import { formatDate } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';

/**
 * Les vidéos masquées de « Dernières sorties », les plus récentes d'abord, avec de quoi les
 * réafficher. La requête ne part qu'à l'ouverture : c'est une liste qu'on consulte rarement.
 */
export const HiddenVideosDialog = ({
  open,
  onOpenChange,
  channelIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelIds: string[];
}) => {
  const { data: videos = [], isLoading } = useVideos(
    { channelIds, hidden: true, limit: 500 },
    { enabled: open },
  );
  const setHidden = useSetVideoHidden();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Vidéos masquées</DialogTitle>
          <DialogDescription>
            Absentes des dernières sorties seulement : elles comptent toujours dans les chiffres,
            les graphiques et les tableaux.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Chargement…</p>
        ) : videos.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune vidéo masquée. L’œil barré, sur une sortie, l’ajoute ici.
          </p>
        ) : (
          <ul className="space-y-2">
            {videos.map((video) => (
              <li key={video.id} className="flex items-center gap-3">
                {video.thumbnailUrl ? (
                  <img
                    src={video.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="h-10 w-16 shrink-0 rounded object-cover"
                  />
                ) : (
                  <span
                    className="h-10 w-16 shrink-0 rounded"
                    style={{ backgroundColor: `${video.channelColor}33` }}
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{video.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {video.channelName} · {formatDate(video.date)}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={setHidden.isPending}
                  onClick={() => setHidden.mutate({ id: video.id, hidden: false })}
                >
                  <Eye className="h-4 w-4" />
                  Réafficher
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};
