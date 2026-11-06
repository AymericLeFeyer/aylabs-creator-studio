import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  ExternalLink,
  Loader2,
  RotateCcw,
  Upload,
  Video,
  X,
} from 'lucide-react';
import {
  usePublishDraftNow,
  useRemoveDraftVideo,
  useUploadDraftVideo,
} from '../../../application/postDraft/usecases/usePostDrafts.ts';
import {
  lastAttempt,
  localDateOf,
  localTimeOf,
  shortState,
  type PostDraft,
} from '../../../domain/postDraft/entities/PostDraft.ts';
import {
  attemptStatusLabel,
  isAttemptRunning,
  PLATFORM_LABELS,
  type PublishAttempt,
  type PublishPlatform,
} from '../../../domain/publish/entities/Publish.ts';
import { cn } from '../../../shared/cn.ts';
import { Button } from '../ui/button.tsx';

const WHEN = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

const formatSize = (bytes: number): string =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} Go`
    : `${Math.max(1, Math.round(bytes / 1024 ** 2))} Mo`;

/** « jeu. 6 nov. 18:00 », ou « aujourd'hui 18:00 » : l'heure est ce qu'on vient lire. */
const formatWhen = (instant: string, today: string): string => {
  const day = localDateOf(instant);
  const prefix =
    day === today ? 'aujourd’hui' : WHEN.format(new Date(`${day}T12:00:00`)).replace('.', '');
  return `${prefix} ${localTimeOf(instant)}`;
};

/** Un fichier glissé est-il une vidéo ? On lit le type annoncé, l'API revérifie. */
const videoOf = (files: FileList | null): File | null => {
  const file = files?.[0];
  return file && file.type.startsWith('video/') ? file : null;
};

interface ShortStripProps {
  draft: PostDraft;
  today: string;
  onSchedule: () => void;
}

/**
 * La seconde ligne d'une publication : **le short lui-même**. La vidéo (glissée sur la
 * ligne, choisie, ou envoyée par l'outil de montage), l'heure de mise en ligne, puis l'état
 * de chaque plateforme une fois partie.
 *
 * Toute la ligne accepte le dépôt d'un fichier : viser une petite zone avec un fichier de
 * 200 Mo tenu à la souris est inutilement précis. Une fois la mise en ligne lancée, la
 * vidéo ne se remplace plus.
 */
export const ShortStrip = ({ draft, today, onSchedule }: ShortStripProps) => {
  const upload = useUploadDraftVideo();
  const removeVideo = useRemoveDraftVideo();
  const publishNow = usePublishDraftNow();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const state = shortState(draft);
  const started = draft.publishStartedAt !== null;
  const archived = draft.archivedAt !== null;
  const canDrop = !started && !archived;

  const send = (file: File) => {
    if (draft.video && !window.confirm(`Remplacer « ${draft.video.fileName} » ?`)) return;
    setError(null);
    setProgress(0);
    upload.mutate(
      { id: draft.id, file, onProgress: setProgress },
      {
        onError: (mutationError) => setError(mutationError.message),
        onSettled: () => setProgress(null),
      },
    );
  };

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
          const file = videoOf(event.dataTransfer.files);
          if (file) send(file);
          else setError('Ce fichier n’est pas une vidéo');
        },
      }
    : {};

  // Une archivée sans rien de parti n'a rien à dire ici.
  if (archived && !started && !draft.video) return null;

  return (
    <div
      {...dropProps}
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md text-xs',
        over && 'bg-primary/10 ring-2 ring-primary',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          const file = videoOf(event.target.files);
          event.target.value = '';
          if (file) send(file);
        }}
      />

      {/* 0. La couverture, si elle est posée */}
      {draft.cover && (
        <img
          src={draft.cover.url}
          alt=""
          title="Couverture (miniature YouTube, couverture Instagram)"
          className="h-8 w-auto rounded-sm border border-border"
        />
      )}

      {/* 1. La vidéo */}
      {progress !== null ? (
        <span className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Envoi {Math.round(progress * 100)} %
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
            <span
              className="block h-full bg-primary transition-[width]"
              style={{ width: `${progress * 100}%` }}
            />
          </span>
        </span>
      ) : draft.video ? (
        <span className="flex min-w-0 items-center gap-1.5">
          <Video className="h-3.5 w-3.5 shrink-0 text-[var(--positive)]" />
          <a
            href={draft.video.url}
            target="_blank"
            rel="noreferrer"
            className="max-w-48 truncate underline-offset-2 hover:underline"
            title="Voir la vidéo"
          >
            {draft.video.fileName}
          </a>
          <span className="text-muted-foreground">{formatSize(draft.video.sizeBytes)}</span>
          {canDrop && (
            <>
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground"
                title="Remplacer la vidéo"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className="text-muted-foreground hover:text-destructive"
                title="Retirer la vidéo"
                disabled={removeVideo.isPending}
                onClick={() => {
                  if (window.confirm(`Retirer « ${draft.video!.fileName} » ?`)) {
                    removeVideo.mutate(draft.id);
                  }
                }}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </span>
      ) : canDrop ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 text-muted-foreground hover:border-primary hover:text-foreground"
        >
          <Upload className="h-3.5 w-3.5" />
          {over ? 'Lâcher la vidéo' : 'Glisser la vidéo ici'}
        </button>
      ) : null}

      {/* 2. L'heure, puis 3. les plateformes */}
      {!started && !archived && <ScheduleChip draft={draft} today={today} onClick={onSchedule} />}

      {started &&
        draft.platforms.map((platform) => (
          <PlatformChip key={platform} platform={platform} attempt={lastAttempt(draft, platform)} />
        ))}

      {state === 'failed' && !archived && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          disabled={publishNow.isPending}
          onClick={() =>
            publishNow.mutate(draft.id, {
              onError: (mutationError) => setError(mutationError.message),
            })
          }
        >
          <RotateCcw className="h-3 w-3" />
          Réessayer
        </Button>
      )}

      {error && <span className="text-destructive">{error}</span>}
    </div>
  );
};

/**
 * Programmée ou pas : le bouton dit l'heure quand il y en a une, et ce qui manque sinon.
 * Une heure passée sans vidéo partira **dès l'arrivée** de la vidéo — c'est dit.
 */
const ScheduleChip = ({
  draft,
  today,
  onClick,
}: {
  draft: PostDraft;
  today: string;
  onClick: () => void;
}) => {
  // Au jour près : `Date.now()` n'a pas sa place dans un rendu, et un jour passé suffit à prévenir.
  const late = draft.scheduledAt !== null && localDateOf(draft.scheduledAt) < today;
  const noPlatform = draft.platforms.length === 0;
  let label: ReactNode = 'Programmer';
  let tone = 'text-muted-foreground';
  let title = 'Choisir l’heure de mise en ligne et les plateformes';
  if (draft.scheduledAt) {
    label = formatWhen(draft.scheduledAt, today);
    tone = draft.video ? 'text-[var(--positive)]' : 'text-foreground';
    title = draft.video
      ? 'Partira à cette heure. Cliquer pour changer.'
      : late
        ? 'Heure passée : partira dès que la vidéo arrive'
        : 'Partira à cette heure, une fois la vidéo arrivée';
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'flex items-center gap-1.5 rounded-md border border-border px-2 py-1 hover:bg-muted',
        tone,
      )}
    >
      <CalendarClock className="h-3.5 w-3.5" />
      {label}
      {draft.scheduledAt && !noPlatform && (
        <span className="text-muted-foreground">
          ·{' '}
          {draft.platforms
            .map((platform) =>
              platform === 'instagram' && draft.options.instagram.trial
                ? 'Instagram (reel d’essai)'
                : PLATFORM_LABELS[platform],
            )
            .join(', ')}
        </span>
      )}
      {draft.scheduledAt && noPlatform && (
        <span className="text-[var(--expense)]">· aucune plateforme</span>
      )}
      {draft.scheduledAt && !draft.video && (
        <span className="text-[var(--expense)]">· vidéo attendue</span>
      )}
    </button>
  );
};

/** L'état d'une plateforme après le lancement, avec le lien quand il existe. */
const PlatformChip = ({
  platform,
  attempt,
}: {
  platform: PublishPlatform;
  attempt: PublishAttempt | null;
}) => {
  const running = !attempt || isAttemptRunning(attempt);
  const failed = attempt?.status === 'failed';
  const icon = running ? (
    <Loader2 className="h-3 w-3 animate-spin" />
  ) : failed ? (
    <AlertTriangle className="h-3 w-3" />
  ) : (
    <Check className="h-3 w-3" />
  );
  const body = (
    <>
      {icon}
      {PLATFORM_LABELS[platform]} · {attempt ? attemptStatusLabel(attempt) : 'Envoi…'}
      {attempt?.url && <ExternalLink className="h-3 w-3" />}
    </>
  );
  const className = cn(
    'flex items-center gap-1 rounded-full border px-2 py-0.5',
    running && 'border-border text-muted-foreground',
    failed && 'border-destructive/50 text-destructive',
    !running && !failed && 'border-[var(--positive)]/50 text-[var(--positive)]',
  );
  const title = [attempt?.targetName, attempt?.error].filter(Boolean).join(' — ') || undefined;
  return attempt?.url ? (
    <a href={attempt.url} target="_blank" rel="noreferrer" className={className} title={title}>
      {body}
    </a>
  ) : (
    <span className={className} title={title}>
      {body}
    </span>
  );
};
