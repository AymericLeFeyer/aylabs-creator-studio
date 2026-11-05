import { useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
import { ExternalLink, Instagram, Loader2, Music2, Trash2, Upload, X, Youtube } from 'lucide-react';
import {
  useDeletePublishVideo,
  usePrepareInstagram,
  usePublishInstagram,
  usePublishTargets,
  usePublishUploads,
  useSendToYouTube,
  useSetYouTubeThumbnail,
  useUploadPublishVideo,
} from '../../application/publish/usecases/usePublish.ts';
import {
  isAttemptRunning,
  PRIVACY_LABELS,
  PUBLISH_STATUS_LABELS,
  publishFileUrl,
  type PublishAttempt,
  type PublishTarget,
  type PublishUploadView,
  type YouTubePrivacy,
} from '../../domain/publish/entities/Publish.ts';
import { formatDateTime } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';
import { Badge, type BadgeProps } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Input, Textarea } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.tsx';
import {
  YouTubeThumbnailPicker,
  type PickedThumbnail,
} from '../components/publish/YouTubeThumbnailPicker.tsx';

/** L'aperçu de la vidéo, vu des panneaux : lire l'instant affiché, y revenir. */
interface VideoPlayer {
  currentMs: () => number | null;
  seek: (ms: number) => void;
}

const formatSize = (bytes: number): string =>
  bytes >= 1024 ** 3
    ? `${(bytes / 1024 ** 3).toFixed(1)} Go`
    : `${Math.max(1, Math.round(bytes / 1024 ** 2))} Mo`;

const STATUS_VARIANTS: Record<PublishAttempt['status'], BadgeProps['variant']> = {
  uploading: 'secondary',
  processing: 'secondary',
  ready: 'cash',
  publishing: 'secondary',
  published: 'positive',
  failed: 'negative',
};

/** Le nom du fichier sans son extension : un titre de départ, à retoucher. */
const titleFromFile = (fileName: string): string =>
  fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .slice(0, 100);

/**
 * Production → Publish : le banc d'essai **temporaire** de la publication directe. On glisse
 * une vidéo, puis on l'envoie plateforme par plateforme avec la configuration déjà faite
 * (chaînes OAuth, comptes Instagram à jeton). YouTube part en privé ; Instagram s'arrête au
 * conteneur prêt tant qu'on n'a pas confirmé, puisqu'il ne sait pas publier en privé.
 */
export const PublishPage = () => {
  const { data: targets } = usePublishTargets();
  const { data: uploads = [], isLoading } = usePublishUploads();

  return (
    <div className="flex flex-col gap-4">
      <div className="hidden lg:block">
        <h1 className="text-lg font-semibold">Publish</h1>
        <p className="text-sm text-muted-foreground">
          Banc d’essai : glisse une vidéo, puis envoie-la sur chaque plateforme, en privé d’abord.
        </p>
      </div>

      <DropZone />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : uploads.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucune vidéo déposée pour l’instant.</p>
      ) : (
        uploads.map((upload) => <UploadCard key={upload.id} upload={upload} targets={targets} />)
      )}
    </div>
  );
};

const DropZone = () => {
  const upload = useUploadPublishVideo();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  const send = (file: File | undefined) => {
    if (!file || upload.isPending) return;
    setProgress(0);
    upload.mutate({ file, onProgress: setProgress }, { onSettled: () => setProgress(null) });
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    send(event.dataTransfer.files[0]);
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        disabled={upload.isPending}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-sm text-muted-foreground transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
        )}
      >
        {progress !== null ? (
          <>
            <Loader2 className="size-5 animate-spin" />
            <span>Envoi au studio… {Math.round(progress * 100)} %</span>
            <span className="h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full bg-primary transition-[width]"
                style={{ width: `${progress * 100}%` }}
              />
            </span>
          </>
        ) : (
          <>
            <Upload className="size-5" />
            <span>Glisse une vidéo ici, ou clique pour la choisir (MP4 ou MOV, 2 Go max)</span>
          </>
        )}
      </button>
      <input
        ref={input}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(event) => {
          send(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {upload.error && (
        <p className="mt-2 text-sm text-[var(--negative)]">{upload.error.message}</p>
      )}
    </div>
  );
};

const UploadCard = ({
  upload,
  targets,
}: {
  upload: PublishUploadView;
  targets: ReturnType<typeof usePublishTargets>['data'];
}) => {
  const remove = useDeletePublishVideo();
  const running = upload.attempts.some(isAttemptRunning);
  const video = useRef<HTMLVideoElement>(null);
  // L'aperçu est à cette carte : c'est elle qui le lit et le déplace.
  const player: VideoPlayer = {
    currentMs: () => (video.current ? Math.round(video.current.currentTime * 1000) : null),
    seek: (ms) => {
      if (video.current) video.current.currentTime = ms / 1000;
    },
  };

  return (
    <Card className="min-w-0">
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="min-w-0">
          <CardTitle className="truncate">{upload.fileName}</CardTitle>
          <CardDescription>
            {formatSize(upload.sizeBytes)} · déposée le {formatDateTime(upload.createdAt)}
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Supprimer la vidéo du studio"
          disabled={running || remove.isPending}
          onClick={() => {
            if (
              window.confirm(
                'Supprimer cette vidéo du studio ? Ce qui a été publié reste en ligne.',
              )
            ) {
              remove.mutate(upload.id);
            }
          }}
        >
          <Trash2 className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <video
          ref={video}
          src={publishFileUrl(upload)}
          controls
          preload="metadata"
          className="max-h-80 w-full rounded-md bg-black object-contain"
        />
        <YouTubePanel upload={upload} channels={targets?.youtube ?? []} />
        <InstagramPanel upload={upload} accounts={targets?.instagram ?? []} player={player} />
        <TikTokPanel reason={targets?.tiktok.reason ?? ''} />
      </CardContent>
    </Card>
  );
};

const PanelTitle = ({ icon, label }: { icon: ReactNode; label: string }) => (
  <div className="flex items-center gap-2 text-sm font-medium">
    {icon}
    {label}
  </div>
);

const AttemptList = ({
  attempts,
  action,
}: {
  attempts: PublishAttempt[];
  action?: (attempt: PublishAttempt) => ReactNode;
}) =>
  attempts.length === 0 ? null : (
    <ul className="space-y-2 border-t pt-2">
      {attempts.map((attempt) => (
        <li key={attempt.id} className="space-y-1 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={STATUS_VARIANTS[attempt.status]}>
              {isAttemptRunning(attempt) && <Loader2 className="mr-1 size-3 animate-spin" />}
              {PUBLISH_STATUS_LABELS[attempt.status]}
            </Badge>
            {attempt.privacy && <Badge variant="outline">{PRIVACY_LABELS[attempt.privacy]}</Badge>}
            <span className="text-muted-foreground">{attempt.targetName}</span>
            {attempt.url && (
              <a
                href={attempt.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-primary hover:underline"
              >
                Ouvrir <ExternalLink className="size-3" />
              </a>
            )}
          </div>
          {attempt.title && <p className="truncate text-muted-foreground">{attempt.title}</p>}
          {attempt.error && <p className="text-[var(--negative)]">{attempt.error}</p>}
          {action?.(attempt)}
        </li>
      ))}
    </ul>
  );

const TargetSelect = ({
  targets,
  value,
  onChange,
  placeholder,
}: {
  targets: PublishTarget[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {targets.map((target) => (
        <SelectItem key={target.id} value={target.id}>
          {target.name}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

const YouTubePanel = ({
  upload,
  channels,
}: {
  upload: PublishUploadView;
  channels: PublishTarget[];
}) => {
  const send = useSendToYouTube();
  const [channelId, setChannelId] = useState('');
  const [title, setTitle] = useState(() => titleFromFile(upload.fileName));
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [privacy, setPrivacy] = useState<YouTubePrivacy>('private');
  const [thumbnail, setThumbnail] = useState<PickedThumbnail | null>(null);
  const setThumbnailLater = useSetYouTubeThumbnail();
  const selected = channelId || channels[0]?.id || '';
  const attempts = upload.attempts.filter((a) => a.platform === 'youtube');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected || !title.trim()) return;
    send.mutate({
      uploadId: upload.id,
      input: {
        channelId: selected,
        title: title.trim(),
        description,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        privacy,
        thumbnail: thumbnail?.source,
      },
    });
  };

  return (
    <form onSubmit={submit} className="min-w-0 space-y-2">
      <PanelTitle icon={<Youtube className="size-4" />} label="YouTube / Shorts" />
      {channels.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucune chaîne OAuth : ajoute un refresh token dans Paramètres → YouTube.
        </p>
      ) : (
        <>
          <TargetSelect
            targets={channels}
            value={selected}
            onChange={setChannelId}
            placeholder="Chaîne"
          />
          <div className="space-y-1">
            <Label htmlFor={`yt-title-${upload.id}`}>Titre</Label>
            <Input
              id={`yt-title-${upload.id}`}
              value={title}
              maxLength={100}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>
          <Textarea
            value={description}
            maxLength={5000}
            rows={3}
            placeholder="Description"
            onChange={(event) => setDescription(event.target.value)}
          />
          <Input
            value={tags}
            placeholder="Tags, séparés par des virgules"
            onChange={(event) => setTags(event.target.value)}
          />
          {/* Pas de « Publique » ici : on teste, et un projet non audité force le privé. */}
          <Select value={privacy} onValueChange={(value) => setPrivacy(value as YouTubePrivacy)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="private">{PRIVACY_LABELS.private}</SelectItem>
              <SelectItem value="unlisted">{PRIVACY_LABELS.unlisted}</SelectItem>
            </SelectContent>
          </Select>
          <YouTubeThumbnailPicker value={thumbnail} onChange={setThumbnail} />
          <Button type="submit" size="sm" disabled={send.isPending || !title.trim()}>
            Envoyer sur YouTube
          </Button>
          <p className="text-xs text-muted-foreground">
            Il faut le scope youtube.upload sur le token. Vertical et 3 min max : c’est un Short. La
            miniature personnalisée demande une chaîne vérifiée.
          </p>
          {send.error && <p className="text-xs text-[var(--negative)]">{send.error.message}</p>}
          {setThumbnailLater.error && (
            <p className="text-xs text-[var(--negative)]">{setThumbnailLater.error.message}</p>
          )}
        </>
      )}
      <AttemptList
        attempts={attempts}
        action={(attempt) =>
          attempt.status === 'published' ? (
            <div className="flex flex-wrap items-center gap-2">
              {attempt.thumbnailSetAt && <Badge variant="positive">Miniature posée</Badge>}
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!thumbnail || setThumbnailLater.isPending}
                title={thumbnail ? undefined : 'Choisis une miniature au-dessus'}
                onClick={() =>
                  thumbnail &&
                  setThumbnailLater.mutate({ attemptId: attempt.id, source: thumbnail.source })
                }
              >
                {attempt.thumbnailSetAt ? 'Remplacer la miniature' : 'Poser la miniature'}
              </Button>
            </div>
          ) : null
        }
      />
    </form>
  );
};

const InstagramPanel = ({
  upload,
  accounts,
  player,
}: {
  upload: PublishUploadView;
  accounts: PublishTarget[];
  player: VideoPlayer;
}) => {
  const prepare = usePrepareInstagram();
  const [coverMs, setCoverMs] = useState<number | null>(null);
  const publish = usePublishInstagram();
  const [accountId, setAccountId] = useState('');
  const [caption, setCaption] = useState('');
  const [shareToFeed, setShareToFeed] = useState(true);
  const selected = accountId || accounts[0]?.id || '';
  const attempts = upload.attempts.filter((a) => a.platform === 'instagram');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selected) return;
    prepare.mutate({
      uploadId: upload.id,
      input: { accountId: selected, caption, shareToFeed, coverOffsetMs: coverMs ?? undefined },
    });
  };

  const confirmPublish = (attempt: PublishAttempt) => {
    if (
      window.confirm(
        `Publier ce Reel sur ${attempt.targetName} ? Instagram n’a pas de mode privé : il sera visible par tous.`,
      )
    ) {
      publish.mutate(attempt.id);
    }
  };

  return (
    <form onSubmit={submit} className="min-w-0 space-y-2">
      <PanelTitle icon={<Instagram className="size-4" />} label="Instagram Reels" />
      {accounts.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Aucun compte à jeton : connecte-en un dans Paramètres → Instagram.
        </p>
      ) : (
        <>
          <TargetSelect
            targets={accounts}
            value={selected}
            onChange={setAccountId}
            placeholder="Compte"
          />
          <Textarea
            value={caption}
            maxLength={2200}
            rows={4}
            placeholder="Légende"
            onChange={(event) => setCaption(event.target.value)}
          />
          <label className="flex items-center gap-2 text-xs">
            <Checkbox
              checked={shareToFeed}
              onCheckedChange={(checked) => setShareToFeed(checked === true)}
            />
            Afficher aussi dans le fil
          </label>
          <CoverFramePicker player={player} value={coverMs} onChange={setCoverMs} />
          <Button type="submit" size="sm" disabled={prepare.isPending}>
            Préparer (sans publier)
          </Button>
          <p className="text-xs text-muted-foreground">
            Le studio envoie la vidéo à Meta, qui la traite. Rien n’est visible tant que tu n’as pas
            cliqué « Publier » : l’API ne connaît pas de mode privé. Permission
            instagram_business_content_publish requise.
          </p>
          {prepare.error && (
            <p className="text-xs text-[var(--negative)]">{prepare.error.message}</p>
          )}
          {publish.error && (
            <p className="text-xs text-[var(--negative)]">{publish.error.message}</p>
          )}
        </>
      )}
      <AttemptList
        attempts={attempts}
        action={(attempt) =>
          attempt.status === 'ready' ? (
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={publish.isPending}
              onClick={() => confirmPublish(attempt)}
            >
              Publier (public)
            </Button>
          ) : null
        }
      />
    </form>
  );
};

const TikTokPanel = ({ reason }: { reason: string }) => (
  <div className="min-w-0 space-y-2">
    <PanelTitle icon={<Music2 className="size-4" />} label="TikTok" />
    <p className="text-xs text-muted-foreground">{reason || 'Pas encore branché.'}</p>
    <p className="text-xs text-muted-foreground">
      Couverture : comme Instagram, TikTok ne prend qu’une image de la vidéo
      (video_cover_timestamp_ms), pas d’image à part.
    </p>
  </div>
);

const formatSeconds = (ms: number): string =>
  `${(ms / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;

/**
 * La couverture d'un Reel : l'image affichée dans l'aperçu au moment du clic. Instagram ne
 * reçoit une image à part que par adresse publique (`cover_url`), que le studio n'a pas.
 */
const CoverFramePicker = ({
  player,
  value,
  onChange,
}: {
  player: VideoPlayer;
  value: number | null;
  onChange: (value: number | null) => void;
}) => (
  <div className="space-y-1 text-xs">
    <span className="font-medium">Couverture</span>
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => {
          const current = player.currentMs();
          if (current !== null) onChange(current);
        }}
      >
        Prendre l’image affichée
      </Button>
      {value === null ? (
        <span className="text-muted-foreground">Par défaut : la première image</span>
      ) : (
        <>
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => {
              player.seek(value);
            }}
          >
            à {formatSeconds(value)}
          </button>
          <button
            type="button"
            aria-label="Revenir à la première image"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => onChange(null)}
          >
            <X className="size-3" />
          </button>
        </>
      )}
    </div>
    <p className="text-muted-foreground">
      Mets la vidéo de gauche sur l’image voulue. Instagram n’accepte pas d’image à part sans
      adresse publique.
    </p>
  </div>
);
