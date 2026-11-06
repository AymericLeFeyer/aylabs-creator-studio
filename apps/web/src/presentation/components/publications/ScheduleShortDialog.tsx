import { useState } from 'react';
import { Send } from 'lucide-react';
import {
  usePublishDraftNow,
  usePublishTargets,
  useUpdatePostDraft,
} from '../../../application/postDraft/usecases/usePostDrafts.ts';
import { localToday } from '../../../application/planning/usecases/usePlanning.ts';
import {
  instantAt,
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

/** L'heure proposée quand rien n'est encore choisi. */
const DEFAULT_TIME = '18:00';

interface ScheduleShortDialogProps {
  draft: PostDraft | null;
  onOpenChange: (open: boolean) => void;
}

/**
 * L'heure de mise en ligne d'un short et ses plateformes — **les trois cochées d'office**,
 * décochables. « Programmer » enregistre ; la vidéo partira toute seule à l'heure dite, dès
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
  const [platforms, setPlatforms] = useState<PublishPlatform[]>([...SHORT_PLATFORMS]);
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
      setPlatforms(draft.platforms.length ? draft.platforms : [...SHORT_PLATFORMS]);
    }
  }

  const toggle = (platform: PublishPlatform) =>
    setPlatforms((current) =>
      SHORT_PLATFORMS.filter((entry) =>
        entry === platform ? !current.includes(entry) : current.includes(entry),
      ),
    );

  const save = async (scheduledAt: string | null) => {
    if (!draft) return;
    setError(null);
    try {
      await update.mutateAsync({
        id: draft.id,
        input: {
          scheduledAt,
          platforms,
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
        input: { platforms, plannedDate: localToday() },
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
            {draft?.title}. La vidéo part toute seule à l’heure choisie, dès qu’elle est arrivée.
            YouTube et Instagram publient en public ; TikTok la dépose dans la boîte de réception de
            l’app, à finir sur le téléphone.
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
            <Label>Plateformes</Label>
            {SHORT_PLATFORMS.map((platform) => {
              const blocker = platformBlocker(platform, targets);
              const target = platformTargetName(platform, targets);
              const id = `short-platform-${platform}`;
              return (
                <label
                  key={platform}
                  htmlFor={id}
                  className="flex cursor-pointer items-start gap-2 text-sm"
                >
                  <Checkbox
                    id={id}
                    checked={platforms.includes(platform)}
                    onCheckedChange={() => toggle(platform)}
                    className="mt-0.5"
                  />
                  <span>
                    {PLATFORM_LABELS[platform]}
                    {target && <span className="text-muted-foreground"> · {target}</span>}
                    {blocker && (
                      <span className="block text-xs text-[var(--expense)]">{blocker}</span>
                    )}
                  </span>
                </label>
              );
            })}
          </div>

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
