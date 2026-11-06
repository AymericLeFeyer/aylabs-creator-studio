import { useState } from 'react';
import { Send } from 'lucide-react';
import {
  usePublishDraftNow,
  usePublishTargets,
  useUpdatePostDraft,
} from '../../../application/postDraft/usecases/usePostDrafts.ts';
import { localToday } from '../../../application/planning/usecases/usePlanning.ts';
import {
  INSTAGRAM_TRIAL_LABELS,
  instantAt,
  YOUTUBE_VISIBILITY_LABELS,
  localDateOf,
  localTimeOf,
  type PostDraft,
} from '../../../domain/postDraft/entities/PostDraft.ts';
import {
  PLATFORM_LABELS,
  platformBlocker,
  platformTargetName,
  SHORT_PLATFORMS,
  type PublishPlatform,
} from '../../../domain/publish/entities/Publish.ts';
import { cn } from '../../../shared/cn.ts';
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

/** Ce que la fiche du short a réglé, rappelé sous chaque plateforme. */
const platformDetail = (draft: PostDraft, platform: PublishPlatform): string | null => {
  if (platform === 'youtube') {
    return `Vidéo ${YOUTUBE_VISIBILITY_LABELS[draft.options.youtube.visibility].toLowerCase()}`;
  }
  if (platform === 'instagram') {
    return draft.options.instagram.trial
      ? INSTAGRAM_TRIAL_LABELS[draft.options.instagram.trial]
      : 'Reel normal, montré aux abonnés';
  }
  return 'Brouillon dans l’app TikTok, à finir sur le téléphone';
};

/** L'heure proposée quand rien n'est encore choisi. */
const DEFAULT_TIME = '18:00';

interface ScheduleShortDialogProps {
  draft: PostDraft | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * L'heure de mise en ligne d'un short. Les plateformes se choisissent **dans la fiche du
 * short** (`PostDraftDialog`) : ici elles sont rappelées en lecture seule, avec le compte
 * visé et ce qui bloquerait, et le type de Reel Instagram. « Programmer » enregistre ; la vidéo partira toute seule à l'heure dite, dès
 * qu'elle est arrivée. « Publier maintenant » la fait partir tout de suite, après
 * confirmation : c'est public sur YouTube et Instagram.
 *
 * Le jour choisi devient aussi la date prévue : la publication change de couloir.
 */
export const ScheduleShortDialog = ({ draft, onOpenChange }: ScheduleShortDialogProps) => {
  const update = useUpdatePostDraft();
  const publishNow = usePublishDraftNow();
  const { data: targets } = usePublishTargets();
  const [day, setDay] = useState('');
  const [time, setTime] = useState(DEFAULT_TIME);
  const platforms = draft?.platforms ?? [];
  const [error, setError] = useState<string | null>(null);

  // Réinitialisé pendant le rendu à chaque ouverture, comme les autres formulaires.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = draft?.id ?? null;
  if (key !== lastKey) {
    setLastKey(key);
    if (draft) {
      setError(null);
      setDay(
        draft.scheduledAt ? localDateOf(draft.scheduledAt) : (draft.plannedDate ?? localToday()),
      );
      setTime(draft.scheduledAt ? localTimeOf(draft.scheduledAt) : DEFAULT_TIME);
    }
  }

  const save = async (scheduledAt: string | null) => {
    if (!draft) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: draft.id,
        input: {
          scheduledAt,
          ...(scheduledAt ? { plannedDate: localDateOf(scheduledAt) } : {}),
        },
      });
      onOpenChange(false);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  const goNow = async () => {
    if (!draft) return;
    const names = platforms.map((platform) => PLATFORM_LABELS[platform]).join(', ');
    if (!window.confirm(`Mettre « ${draft.title} » en ligne maintenant sur ${names} ?`)) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: draft.id,
        input: { plannedDate: localToday() },
      });
      await publishNow.mutateAsync(draft.id);
      onOpenChange(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Mise en ligne impossible');
    }
  };

  const pending = update.isPending || publishNow.isPending;
  const valid = Boolean(day && time) && platforms.length > 0;

  return (
    <Dialog open={draft !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mise en ligne</DialogTitle>
          <DialogDescription>
            {draft?.title}. La vidéo part toute seule à l’heure choisie, dès qu’elle est arrivée. Ce
            qui part et où (visibilité, reel d’essai…) se règle dans la fiche du short.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="short-day">Jour</Label>
              <Input
                id="short-day"
                type="date"
                value={day}
                onChange={(event) => setDay(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="short-time">Heure</Label>
              <Input
                id="short-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label>Plateformes</Label>
              <span className="text-xs text-muted-foreground">
                Se changent dans la fiche du short
              </span>
            </div>
            {SHORT_PLATFORMS.map((platform) => {
              const blocker = platformBlocker(platform, targets);
              const target = platformTargetName(platform, targets);
              const id = `short-platform-${platform}`;
              const checked = platforms.includes(platform);
              const detail = draft ? platformDetail(draft, platform) : null;
              return (
                <div
                  key={platform}
                  className={cn(
                    'flex items-start gap-2 text-sm',
                    !checked && 'text-muted-foreground',
                  )}
                >
                  <Checkbox id={id} checked={checked} disabled className="mt-0.5" />
                  <span>
                    {PLATFORM_LABELS[platform]}
                    {checked && target && (
                      <span className="text-muted-foreground"> · {target}</span>
                    )}
                    {!checked && <span> · n’y part pas</span>}
                    {checked && detail && (
                      <span className="block text-xs text-muted-foreground">{detail}</span>
                    )}
                    {checked && blocker && (
                      <span className="block text-xs text-[var(--expense)]">{blocker}</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {platforms.length === 0 && (
            <p className="text-xs text-[var(--expense)]">
              Aucune plateforme cochée dans la fiche du short : il ne partira nulle part.
            </p>
          )}
          {!draft?.video && (
            <p className="text-xs text-muted-foreground">
              La vidéo n’est pas encore arrivée : la programmation l’attendra. Si l’heure est passée
              à son arrivée, elle partira aussitôt.
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {draft?.scheduledAt && (
            <Button
              type="button"
              variant="ghost"
              className="mr-auto"
              disabled={pending}
              onClick={() => void save(null)}
            >
              Retirer l’heure
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={pending || !draft?.video || platforms.length === 0}
            title={draft?.video ? undefined : 'La vidéo n’est pas encore arrivée'}
            onClick={() => void goNow()}
          >
            <Send className="h-4 w-4" />
            Publier maintenant
          </Button>
          <Button
            type="button"
            disabled={pending || !valid}
            onClick={() => void save(instantAt(day, time))}
          >
            {pending ? 'Enregistrement…' : 'Programmer'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
