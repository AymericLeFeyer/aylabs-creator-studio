import { Bookmark, BookmarkCheck, BookmarkX, Download, Loader2, Trash2 } from 'lucide-react';
import {
  useDeleteThumbnail,
  useSaveThumbnail,
  useUnsaveThumbnail,
} from '../../../application/thumbnail/usecases/useThumbnails.ts';
import { thumbnailUrl, type Thumbnail } from '../../../domain/thumbnail/entities/Thumbnail.ts';
import { cn } from '../../../shared/cn.ts';
import { formatDateTime } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { THUMBNAIL_RATIO } from './thumbnailRatio.ts';

const fileName = (thumbnail: Thumbnail): string => {
  const slug = (thumbnail.title ?? 'miniature')
    .normalize('NFD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .toLowerCase();
  return `${slug || 'miniature'}.jpg`;
};

interface ThumbnailCardProps {
  thumbnail: Thumbnail;
  /**
   * `history` : l'écran Miniatures (enregistrer, supprimer). `saved` : l'onglet de la fiche,
   * où l'on ne fait que retirer l'enregistrement.
   */
  variant?: 'history' | 'saved';
  /** La vidéo choisie sur l'écran, pour une miniature générée sans vidéo. */
  fallbackProductionId?: string | null;
}

/**
 * Une miniature, son téléchargement, et le bouton « Enregistrer » qui la garde pour sa
 * vidéo — ce qui coche l'étape « miniature » côté API. Autant d'enregistrées qu'on veut.
 */
export const ThumbnailCard = ({
  thumbnail,
  variant = 'history',
  fallbackProductionId = null,
}: ThumbnailCardProps) => {
  const remove = useDeleteThumbnail();
  const save = useSaveThumbnail();
  const unsave = useUnsaveThumbnail();
  const url = thumbnailUrl(thumbnail.id);
  const saved = thumbnail.savedAt !== null;
  const target = thumbnail.productionId ?? fallbackProductionId;
  const busy = save.isPending || unsave.isPending;

  return (
    <figure className="min-w-0 space-y-1.5">
      <a href={url} target="_blank" rel="noreferrer" className="relative block">
        <img
          src={url}
          alt={thumbnail.title ?? 'Miniature'}
          loading="lazy"
          className={cn(
            'w-full rounded-md border object-cover',
            THUMBNAIL_RATIO[thumbnail.format],
            saved && variant === 'history' && 'ring-2 ring-primary',
          )}
        />
        {saved && variant === 'history' && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs font-medium text-primary-foreground">
            <BookmarkCheck className="h-3 w-3" />
            Enregistrée
          </span>
        )}
      </a>
      <figcaption className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          {variant === 'history' && (
            <p className="truncate text-sm font-medium">{thumbnail.title ?? 'Sans vidéo'}</p>
          )}
          <p className="text-xs text-muted-foreground">
            {thumbnail.format} ·{' '}
            {formatDateTime(
              variant === 'saved'
                ? (thumbnail.savedAt ?? thumbnail.createdAt)
                : thumbnail.createdAt,
            )}
          </p>
          {thumbnail.prompt && (
            <p className="truncate text-xs text-muted-foreground" title={thumbnail.prompt}>
              {thumbnail.prompt}
            </p>
          )}
        </div>
        <Button asChild variant="ghost" size="icon" aria-label="Télécharger" title="Télécharger">
          <a href={url} download={fileName(thumbnail)}>
            <Download className="h-4 w-4" />
          </a>
        </Button>
        {variant === 'saved' ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Retirer de la vidéo"
            title="Retirer de la vidéo (reste dans l’historique)"
            disabled={busy}
            onClick={() => unsave.mutate(thumbnail.id)}
          >
            <BookmarkX className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            aria-label="Supprimer"
            title="Supprimer"
            onClick={() => {
              if (window.confirm('Supprimer cette miniature ?')) remove.mutate(thumbnail.id);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </figcaption>
      {variant === 'history' && (
        <Button
          size="sm"
          variant={saved ? 'secondary' : 'outline'}
          className="w-full"
          disabled={busy || (!saved && !target)}
          title={
            !saved && !target
              ? 'Choisis une vidéo pour y enregistrer cette miniature'
              : saved
                ? 'Retirer de la vidéo (la case « Miniature » reste cochée)'
                : 'Garder pour la vidéo et cocher l’étape « Miniature »'
          }
          onClick={() =>
            saved
              ? unsave.mutate(thumbnail.id)
              : save.mutate({ id: thumbnail.id, productionId: target })
          }
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : saved ? (
            <BookmarkCheck className="h-4 w-4" />
          ) : (
            <Bookmark className="h-4 w-4" />
          )}
          {saved ? 'Enregistrée' : 'Enregistrer'}
        </Button>
      )}
      {(save.error ?? unsave.error) && (
        <p className="text-xs text-destructive">{(save.error ?? unsave.error)?.message}</p>
      )}
    </figure>
  );
};
