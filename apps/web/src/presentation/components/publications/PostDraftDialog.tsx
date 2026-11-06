import { useState, type ReactNode } from 'react';
import { Trash2 } from 'lucide-react';
import {
  useCreatePostDraft,
  useDeletePostDraft,
  useSetDraftCover,
  useUpdatePostDraft,
} from '../../../application/postDraft/usecases/usePostDrafts.ts';
import {
  CAPTION_MAX_LENGTH,
  captionWithHashtags,
  DEFAULT_SHORT_OPTIONS,
  INSTAGRAM_TRIAL_LABELS,
  rescheduleOnDay,
  YOUTUBE_CATEGORIES,
  YOUTUBE_VISIBILITY_LABELS,
  type InstagramTrial,
  type PostDraft,
  type PostDraftUpdate,
  type ShortOptions,
  type YouTubeVisibility,
} from '../../../domain/postDraft/entities/PostDraft.ts';
import { cn } from '../../../shared/cn.ts';
import { fromSelectValue, NONE, toSelectValue } from '../forms/selectNone.ts';
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
import { Input, Textarea } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { CoverPicker, type PickedCover } from './CoverPicker.tsx';

interface PostDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft?: PostDraft | null;
  /** Date pré-remplie d'une création : celle du jour sur lequel on a cliqué « + ». */
  defaultDate?: string | null;
}

const EMPTY = { title: '', description: '', plannedDate: '' };

/** La limite d'un titre YouTube. */
const TITLE_MAX = 100;
/** La limite cumulée des tags YouTube. */
const TAGS_MAX = 500;

const Section = ({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) => (
  <fieldset className="space-y-3 rounded-lg border border-border p-3">
    <legend className="px-1 text-sm font-medium">{title}</legend>
    {hint && <p className="-mt-1 text-xs text-muted-foreground">{hint}</p>}
    {children}
  </fieldset>
);

const Check = ({
  id,
  checked,
  onChange,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
}) => (
  <label htmlFor={id} className="flex cursor-pointer items-center gap-2 text-sm">
    <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
    {children}
  </label>
);

const Counter = ({ value, max }: { value: number; max: number }) => (
  <span
    className={cn(
      'text-xs tabular text-muted-foreground',
      value > max && 'font-medium text-destructive',
    )}
  >
    {value} / {max}
  </span>
);

/**
 * Création et édition d'un short : **tout ce qui peut partir avec la vidéo**, même si
 * chaque plateforme n'en prend qu'une partie.
 *
 * Seul le titre est obligatoire : on note souvent un short avant d'en avoir écrit la légende
 * ou choisi le jour, et exiger le reste ferait renoncer à le noter. Le reste se complète
 * plus tard, en rouvrant la fiche.
 */
export const PostDraftDialog = ({
  open,
  onOpenChange,
  draft,
  defaultDate,
}: PostDraftDialogProps) => {
  const create = useCreatePostDraft();
  const update = useUpdatePostDraft();
  const remove = useDeletePostDraft();
  const setCover = useSetDraftCover();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [options, setOptions] = useState<ShortOptions>(DEFAULT_SHORT_OPTIONS);
  const [cover, setCoverValue] = useState<PickedCover | null>(null);

  // Réinitialisé pendant le rendu à chaque ouverture, comme les autres formulaires du
  // projet : un effet ferait un rendu de plus et la règle `set-state-in-effect` le refuse.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${draft?.id ?? 'new'}-${defaultDate ?? ''}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setError(null);
    setForm(
      draft
        ? {
            title: draft.title,
            description: draft.description,
            plannedDate: draft.plannedDate ?? '',
          }
        : { ...EMPTY, plannedDate: defaultDate ?? '' },
    );
    setOptions(draft?.options ?? DEFAULT_SHORT_OPTIONS);
    setCoverValue(draft?.cover ? { source: null, previewUrl: draft.cover.url } : null);
  }

  const youtube = (patch: Partial<ShortOptions['youtube']>) =>
    setOptions((current) => ({ ...current, youtube: { ...current.youtube, ...patch } }));
  const instagram = (patch: Partial<ShortOptions['instagram']>) =>
    setOptions((current) => ({ ...current, instagram: { ...current.instagram, ...patch } }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const payload: PostDraftUpdate & { title: string } = {
      title: form.title.trim(),
      description: form.description,
      plannedDate: form.plannedDate || null,
      options,
    };
    // Changer le jour d'un short programmé le déplace à la même heure (sans jour, plus
    // d'heure) — tant que la mise en ligne n'est pas lancée.
    if (
      draft?.scheduledAt &&
      !draft.publishStartedAt &&
      payload.plannedDate !== draft.plannedDate
    ) {
      payload.scheduledAt = payload.plannedDate
        ? rescheduleOnDay(draft.scheduledAt, payload.plannedDate)
        : null;
    }
    try {
      // Une création n'admet que les champs de base : les options suivent par un PATCH.
      const saved = draft
        ? await update.mutateAsync({ id: draft.id, input: payload })
        : await create.mutateAsync({
            title: payload.title,
            description: payload.description,
            plannedDate: payload.plannedDate,
          });
      if (!draft) await update.mutateAsync({ id: saved.id, input: { options } });
      // La couverture : seulement si elle a changé.
      if (cover?.source) await setCover.mutateAsync({ id: saved.id, source: cover.source });
      else if (!cover && draft?.cover) await setCover.mutateAsync({ id: saved.id, source: null });
      onOpenChange(false);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  const pending = create.isPending || update.isPending || setCover.isPending;
  const caption = captionWithHashtags(form.description, options.hashtags);
  const tooLong =
    caption.length > CAPTION_MAX_LENGTH ||
    form.title.trim().length > TITLE_MAX ||
    options.youtube.tags.length > TAGS_MAX;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{draft ? 'Modifier le short' : 'Nouveau short'}</DialogTitle>
          <DialogDescription>
            Le titre suffit pour commencer. Tout le reste part avec la vidéo, chaque plateforme
            prenant ce qu’elle sait recevoir ; la vidéo et l’heure se posent sur la ligne.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="draft-title">Titre</Label>
                <Counter value={form.title.trim().length} max={TITLE_MAX} />
              </div>
              <Input
                id="draft-title"
                placeholder="Le titre du short (titre YouTube)"
                value={form.title}
                onChange={(event) => setForm((f) => ({ ...f, title: event.target.value }))}
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="draft-date">Date prévue</Label>
              <Input
                id="draft-date"
                type="date"
                value={form.plannedDate}
                onChange={(event) => setForm((f) => ({ ...f, plannedDate: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="draft-description">Description</Label>
              {/* La limite d'Instagram, hashtags compris : la dépasser se découvre sinon au
                  moment de publier. */}
              <Counter value={caption.length} max={CAPTION_MAX_LENGTH} />
            </div>
            <Textarea
              id="draft-description"
              rows={6}
              placeholder="Description YouTube, légende Instagram"
              value={form.description}
              onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="draft-hashtags">Hashtags</Label>
            <Input
              id="draft-hashtags"
              placeholder="#domotique #homeassistant #shorts"
              value={options.hashtags}
              onChange={(event) => setOptions((o) => ({ ...o, hashtags: event.target.value }))}
            />
            <p className="text-xs text-muted-foreground">
              Ajoutés à la fin de la description YouTube et de la légende Instagram.
            </p>
          </div>

          <Section
            title="Couverture"
            hint="Miniature YouTube et couverture Instagram. Une miniature de Production → Miniatures, ou une image (ramenée en JPEG, 2 Mo au plus)."
          >
            <CoverPicker
              value={cover}
              onChange={setCoverValue}
              productionId={draft?.productionId ?? null}
            />
          </Section>

          <Section title="YouTube">
            <div className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor="draft-tags">Tags</Label>
                <Counter value={options.youtube.tags.length} max={TAGS_MAX} />
              </div>
              <Input
                id="draft-tags"
                placeholder="domotique, home assistant, zigbee"
                value={options.youtube.tags}
                onChange={(event) => youtube({ tags: event.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Visibilité</Label>
                <Select
                  value={options.youtube.visibility}
                  onValueChange={(value) => youtube({ visibility: value as YouTubeVisibility })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(YOUTUBE_VISIBILITY_LABELS) as YouTubeVisibility[]).map(
                      (value) => (
                        <SelectItem key={value} value={value}>
                          {YOUTUBE_VISIBILITY_LABELS[value]}
                        </SelectItem>
                      ),
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Catégorie</Label>
                <Select
                  value={toSelectValue(options.youtube.categoryId)}
                  onValueChange={(value) => youtube({ categoryId: fromSelectValue(value) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Par défaut</SelectItem>
                    {YOUTUBE_CATEGORIES.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <Check
                id="draft-notify"
                checked={options.youtube.notifySubscribers}
                onChange={(notifySubscribers) => youtube({ notifySubscribers })}
              >
                Notifier les abonnés
              </Check>
              <Check
                id="draft-kids"
                checked={options.youtube.madeForKids}
                onChange={(madeForKids) => youtube({ madeForKids })}
              >
                Conçue pour les enfants
              </Check>
            </div>
          </Section>

          <Section title="Instagram">
            <div className="space-y-1.5">
              <Label>Type de Reel</Label>
              <Select
                value={options.instagram.trial ?? NONE}
                onValueChange={(value) =>
                  instagram({ trial: value === NONE ? null : (value as InstagramTrial) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Reel normal — montré à mes abonnés</SelectItem>
                  {(Object.keys(INSTAGRAM_TRIAL_LABELS) as InstagramTrial[]).map((value) => (
                    <SelectItem key={value} value={value}>
                      {INSTAGRAM_TRIAL_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {options.instagram.trial && (
                <p className="text-xs text-muted-foreground">
                  Un Reel d’essai n’est montré qu’aux non-abonnés. Instagram le réserve aux comptes
                  professionnels éligibles : s’il le refuse, l’erreur s’affiche sur la ligne.
                </p>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <div className="space-y-1.5">
                <Label htmlFor="draft-collab">Collaborateurs</Label>
                <Input
                  id="draft-collab"
                  placeholder="@compte1, @compte2 (3 au plus)"
                  value={options.instagram.collaborators}
                  onChange={(event) => instagram({ collaborators: event.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="draft-cover-at">Image à (s)</Label>
                <Input
                  id="draft-cover-at"
                  type="number"
                  min={0}
                  step={0.5}
                  placeholder="Début"
                  disabled={cover !== null}
                  title={
                    cover
                      ? 'Une couverture est choisie : elle l’emporte'
                      : 'Sans couverture : l’image de la vidéo à cet instant'
                  }
                  value={options.instagram.coverAtSeconds ?? ''}
                  onChange={(event) =>
                    instagram({
                      coverAtSeconds: event.target.value === '' ? null : Number(event.target.value),
                    })
                  }
                />
              </div>
            </div>
            <Check
              id="draft-feed"
              checked={options.instagram.shareToFeed}
              onChange={(shareToFeed) => instagram({ shareToFeed })}
            >
              Aussi dans la grille du profil
            </Check>
          </Section>

          <p className="text-xs text-muted-foreground">
            TikTok reçoit la vidéo en brouillon dans l’app : légende, hashtags et couverture se
            règlent sur le téléphone (le bouton « copier » de la ligne copie la légende complète).
          </p>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            {/* Supprimer vit ici et non sur la ligne : on archive une publication faite, on
                ne supprime qu'une idée abandonnée — rare, et irréversible. */}
            {draft && (
              <Button
                type="button"
                variant="ghost"
                className="mr-auto text-destructive"
                disabled={remove.isPending}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Supprimer « ${draft.title} » ? Rien ne permet de la retrouver.`,
                    )
                  )
                    return;
                  remove.mutate(draft.id, { onSuccess: () => onOpenChange(false) });
                }}
              >
                <Trash2 className="h-4 w-4" />
                Supprimer
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending || tooLong}>
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
