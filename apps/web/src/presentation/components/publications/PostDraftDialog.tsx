import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import {
  useCreatePostDraft,
  useDeletePostDraft,
  useUpdatePostDraft,
} from '../../../application/postDraft/usecases/usePostDrafts.ts';
import {
  CAPTION_MAX_LENGTH,
  type PostDraft,
} from '../../../domain/postDraft/entities/PostDraft.ts';
import { cn } from '../../../shared/cn.ts';
import { Button } from '../ui/button.tsx';
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

interface PostDraftDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft?: PostDraft | null;
  /** Date pré-remplie d'une création : celle du jour sur lequel on a cliqué « + ». */
  defaultDate?: string | null;
}

const EMPTY = { title: '', description: '', plannedDate: '' };

/**
 * Création et édition d'un brouillon de publication.
 *
 * Seul le titre est obligatoire : on note souvent une publication avant d'en avoir écrit
 * la légende ou choisi le jour, et exiger les trois ferait renoncer à la noter.
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
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

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
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const payload = {
      title: form.title.trim(),
      description: form.description,
      plannedDate: form.plannedDate || null,
    };
    try {
      if (draft) await update.mutateAsync({ id: draft.id, input: payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  const pending = create.isPending || update.isPending;
  const tooLong = form.description.length > CAPTION_MAX_LENGTH;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{draft ? 'Modifier le brouillon' : 'Nouveau brouillon'}</DialogTitle>
          <DialogDescription>
            Une publication à venir : de quoi elle parle, sa légende, et le jour où elle doit
            sortir.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_11rem]">
            <div className="space-y-1.5">
              <Label htmlFor="draft-title">Titre</Label>
              <Input
                id="draft-title"
                placeholder="Le sujet de la publication"
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
              {/* La limite d'Instagram : la dépasser se découvre sinon au moment de publier. */}
              <span
                className={cn(
                  'text-xs tabular text-muted-foreground',
                  tooLong && 'font-medium text-destructive',
                )}
              >
                {form.description.length} / {CAPTION_MAX_LENGTH}
              </span>
            </div>
            <Textarea
              id="draft-description"
              rows={8}
              placeholder="La légende, les hashtags…"
              value={form.description}
              onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
            />
          </div>

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
