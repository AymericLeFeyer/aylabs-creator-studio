import { useState, type DragEvent, type PointerEvent } from 'react';
import {
  AlertTriangle,
  GripVertical,
  Instagram,
  Loader2,
  Music2,
  Video,
  Youtube,
} from 'lucide-react';
import { useUploadDraftVideo } from '../../../application/postDraft/usecases/usePostDrafts.ts';
import {
  lastAttempt,
  localDateOf,
  localTimeOf,
  type PostDraft,
} from '../../../domain/postDraft/entities/PostDraft.ts';
import {
  isAttemptRunning,
  PLATFORM_LABELS,
  type PublishPlatform,
} from '../../../domain/publish/entities/Publish.ts';
import { cn } from '../../../shared/cn.ts';

const PLATFORM_ICONS = {
  youtube: Youtube,
  instagram: Instagram,
  tiktok: Music2,
} as const;

const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });

interface ShortTileProps {
  draft: PostDraft;
  /** Le couloir où la tuile est posée : l'heure n'y répète pas le jour, sauf s'il diffère. */
  laneDay: string | null;
  onEdit: () => void;
  /** Celle qu'on est venu voir depuis une fiche de vidéo. */
  highlighted: boolean;
  dragging: boolean;
  /** Absent sur une publication archivée : elle ne se déplace pas. */
  onDragStart?: (event: PointerEvent) => void;
}

/**
 * Un short en **tuile verticale** : la couverture (sinon la première image de la vidéo),
 * les plateformes visées en petites icônes, l'heure de mise en ligne — et le jour seulement
 * quand il diffère de celui du couloir. Le titre apparaît au survol, le clic ouvre la fiche.
 *
 * Une tuile fait 80 à 96 px de large et se pose en `flex-wrap` : cinq verticaux le même jour
 * tiennent sur une ligne au large, sur deux ou trois au téléphone, sans rien rogner. Un
 * fichier vidéo lâché dessus est envoyé (tant que la mise en ligne n'est pas lancée).
 */
export const ShortTile = ({
  draft,
  laneDay,
  onEdit,
  highlighted,
  dragging,
  onDragStart,
}: ShortTileProps) => {
  const upload = useUploadDraftVideo();
  const [over, setOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const started = draft.publishStartedAt !== null;
  const archived = draft.archivedAt !== null;
  const canDrop = !started && !archived;

  const attempts = draft.platforms.map((platform) => ({
    platform,
    attempt: started ? lastAttempt(draft, platform) : null,
  }));
  const failed = attempts.some(({ attempt }) => attempt?.status === 'failed');
  const running = started && attempts.some(({ attempt }) => !attempt || isAttemptRunning(attempt));
  const online = attempts.some(
    ({ attempt }) => attempt?.status === 'published' || attempt?.status === 'ready',
  );

  const sameDay = draft.scheduledAt && laneDay && localDateOf(draft.scheduledAt) === laneDay;
  const when = draft.scheduledAt
    ? `${sameDay ? '' : `${DAY_MONTH.format(new Date(`${localDateOf(draft.scheduledAt)}T12:00:00`)).replace('.', '')} `}${localTimeOf(draft.scheduledAt)}`
    : null;

  const dropProps = canDrop
    ? {
        onDragOver: (event: DragEvent) => {
          if (!event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setOver(true);
        },
        onDragLeave: () => setOver(false),
        onDrop: (event: DragEvent) => {
          event.preventDefault();
          setOver(false);
          const file = event.dataTransfer.files[0];
          if (!file?.type.startsWith('video/')) return;
          if (draft.video && !window.confirm(`Remplacer « ${draft.video.fileName} » ?`)) return;
          setProgress(0);
          upload.mutate(
            { id: draft.id, file, onProgress: setProgress },
            { onSettled: () => setProgress(null) },
          );
        },
      }
    : {};

  return (
    <div
      {...dropProps}
      data-publication-id={draft.id}
      role="button"
      tabIndex={0}
      aria-label={draft.title}
      onClick={onEdit}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onEdit();
        }
      }}
      className={cn(
        'group relative aspect-[9/16] w-20 shrink-0 cursor-pointer overflow-hidden rounded-md border bg-muted sm:w-24',
        failed ? 'border-destructive' : online ? 'border-[var(--positive)]' : 'border-border',
        highlighted && 'ring-2 ring-primary',
        over && 'ring-2 ring-primary',
        archived && 'opacity-55',
        dragging && 'opacity-40',
      )}
    >
      {draft.cover ? (
        <img src={draft.cover.url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      ) : draft.video && !archived ? (
        // Pas de couverture : la première image de la vidéo, sans la télécharger en entier.
        <video
          src={`${draft.video.url}#t=0.5`}
          preload="metadata"
          muted
          playsInline
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
          <Video className="h-6 w-6" />
        </div>
      )}

      {/* Bas de tuile : plateformes puis heure, sur un dégradé pour rester lisibles. */}
      <div className="absolute inset-x-0 bottom-0 space-y-0.5 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-5 text-white">
        {attempts.length > 0 && (
          <div className="flex items-center gap-1">
            {attempts.map(({ platform, attempt }) => (
              <PlatformIcon
                key={platform}
                platform={platform}
                status={attempt?.status}
                started={started}
              />
            ))}
          </div>
        )}
        <p className="tabular text-[11px] font-medium leading-tight">
          {when ?? <span className="opacity-70">Sans heure</span>}
        </p>
      </div>

      {(running || progress !== null) && (
        <div className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white">
          <Loader2 className="h-3 w-3 animate-spin" />
        </div>
      )}
      {failed && !running && (
        <div className="absolute right-1 top-1 rounded-full bg-destructive p-1 text-white">
          <AlertTriangle className="h-3 w-3" />
        </div>
      )}

      {/* Le titre au survol (et au focus clavier). Sur tactile, il se lit dans la fiche. */}
      <div className="pointer-events-none absolute inset-0 flex items-start bg-black/75 p-2 text-[11px] font-medium leading-snug text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        <span className="line-clamp-6 pl-4">{draft.title}</span>
      </div>

      {/* `touch-none` sur la seule poignée : au doigt, le reste de la tuile fait défiler. */}
      {onDragStart && (
        <span
          role="button"
          aria-label="Déplacer vers un autre jour"
          title="Glisser vers un autre jour"
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => {
            event.stopPropagation();
            onDragStart(event);
          }}
          className="absolute left-0 top-0 flex h-6 w-6 cursor-grab touch-none items-center justify-center rounded-br-md bg-black/50 text-white active:cursor-grabbing lg:opacity-0 lg:group-hover:opacity-100"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  );
};

const PlatformIcon = ({
  platform,
  status,
  started,
}: {
  platform: PublishPlatform;
  status: string | undefined;
  started: boolean;
}) => {
  const Icon = PLATFORM_ICONS[platform];
  const tone =
    status === 'failed'
      ? 'text-red-400'
      : status === 'published' || status === 'ready'
        ? 'text-emerald-400'
        : started
          ? 'text-white/70'
          : 'text-white';
  return (
    <span title={PLATFORM_LABELS[platform]} className={tone}>
      <Icon className="h-3.5 w-3.5" />
    </span>
  );
};
