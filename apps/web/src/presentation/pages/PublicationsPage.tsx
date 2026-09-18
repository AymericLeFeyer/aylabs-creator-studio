import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, Check, Copy, Images, Pencil, Plus } from 'lucide-react';
import {
  usePostDrafts,
  useUpdatePostDraft,
} from '../../application/postDraft/usecases/usePostDrafts.ts';
import { localToday } from '../../application/planning/usecases/usePlanning.ts';
import {
  daysUntil,
  isPostDraftComplete,
  localDateOf,
  POST_DRAFT_STEP_LABELS,
  POST_DRAFT_STEPS,
  toggleStep,
  type PostDraft,
} from '../../domain/postDraft/entities/PostDraft.ts';
import { formatDate } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Fab } from '../components/Fab.tsx';
import { PageAlerts } from '../components/PageAlerts.tsx';
import { PostDraftDialog } from '../components/publications/PostDraftDialog.tsx';

/** « Aujourd'hui », « Demain », « Dans 5 j », « Il y a 2 j ». */
const relative = (days: number): string => {
  if (days === 0) return 'Aujourd’hui';
  if (days === 1) return 'Demain';
  if (days === -1) return 'Hier';
  return days > 1 ? `Dans ${days} j` : `Il y a ${-days} j`;
};

/**
 * Production → Publications : les publications à venir, **en liste triée par date**.
 *
 * Une ligne par publication : sa date, son titre, et six cases — la fabrication (montage,
 * sous-titres, miniature) puis la mise en ligne (YouTube, Insta, TikTok). Quand tout est
 * coché, le bouton d'archivage passe au vert : un clic, **sans confirmation**, et la ligne
 * part dans les archives. Archiver se défait depuis les archives ; une confirmation sur
 * un geste qu'on répète à chaque publication ne protégerait de rien.
 *
 * C'est l'archivage d'une publication complète qui fait une publication **validée** : elle
 * remet à zéro le compteur « -X » du menu (`PageAlerts` le redit en tête d'écran).
 *
 * C'est la préparation ; ce qui est réellement paru se lit dans Audience → Instagram.
 */
export const PublicationsPage = () => {
  const [showArchives, setShowArchives] = useState(false);
  const { data: drafts = [], isLoading } = usePostDrafts(showArchives);
  const update = useUpdatePostDraft();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // L'identifiant et non la fiche : après enregistrement la liste est rechargée, et un
  // instantané figé rouvrirait le formulaire sur l'ancienne version.
  const editing = drafts.find((draft) => draft.id === editingId) ?? null;
  const today = localToday();

  const copy = async (draft: PostDraft) => {
    try {
      await navigator.clipboard.writeText(draft.description);
      setCopiedId(draft.id);
      window.setTimeout(
        () => setCopiedId((current) => (current === draft.id ? null : current)),
        1500,
      );
    } catch {
      // Presse-papier refusé (contexte non sécurisé) : le texte reste dans le formulaire.
    }
  };

  const toggle = (draft: PostDraft, step: (typeof POST_DRAFT_STEPS)[number]) =>
    update.mutate({ id: draft.id, input: { steps: toggleStep(draft.steps, step) } });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">Publications</h1>
          <p className="text-sm text-muted-foreground">
            Les publications à venir. Tout coché, on archive. Ce qui est paru se lit dans{' '}
            <Link to="/instagram" className="underline underline-offset-2">
              Audience → Instagram
            </Link>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowArchives((value) => !value)}>
            <Archive className="h-4 w-4" />
            {showArchives ? 'Retour à la liste' : 'Archives'}
          </Button>
          <Button size="sm" className="hidden lg:inline-flex" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle publication
          </Button>
        </div>
      </div>

      <PageAlerts path="/publications" />

      {!isLoading && drafts.length === 0 ? (
        <Card className="space-y-3 p-6 text-center">
          <Images className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">
            {showArchives ? 'Aucune publication archivée' : 'Rien à publier pour l’instant'}
          </p>
          {!showArchives && (
            <>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                Note une publication à venir — un titre suffit, la légende et la date peuvent
                attendre.
              </p>
              <Button size="sm" onClick={() => setDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                Nouvelle publication
              </Button>
            </>
          )}
        </Card>
      ) : (
        <Card className="divide-y divide-border overflow-hidden">
          {drafts.map((draft) => {
            const days = draft.plannedDate ? daysUntil(draft.plannedDate, today) : null;
            const late = !showArchives && days !== null && days < 0;
            const complete = isPostDraftComplete(draft.steps);
            return (
              <div
                key={draft.id}
                className="flex flex-col gap-2 px-4 py-3 lg:flex-row lg:items-center lg:gap-4"
              >
                {/* La date d'abord : c'est elle qui ordonne la liste. */}
                <div className="w-28 shrink-0 text-sm">
                  {showArchives && draft.archivedAt ? (
                    <>
                      <p className="font-medium tabular">
                        {formatDate(localDateOf(draft.archivedAt))}
                      </p>
                      <p className="text-xs text-muted-foreground">archivée</p>
                    </>
                  ) : draft.plannedDate && days !== null ? (
                    <>
                      <p
                        className={cn(
                          'font-medium tabular',
                          late && 'text-[var(--negative)]',
                          days === 0 && 'text-[var(--today)]',
                        )}
                      >
                        {formatDate(draft.plannedDate)}
                      </p>
                      <p
                        className={cn(
                          'text-xs text-muted-foreground',
                          late && 'text-[var(--negative)]',
                        )}
                      >
                        {relative(days)}
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Sans date</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setEditingId(draft.id)}
                  className="min-w-0 flex-1 text-left"
                  title="Modifier"
                >
                  <p className="truncate font-medium">{draft.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {draft.description || 'Pas encore de description'}
                  </p>
                </button>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  {POST_DRAFT_STEPS.map((step) => {
                    const id = `${draft.id}-${step}`;
                    return (
                      <label
                        key={step}
                        htmlFor={id}
                        className="flex cursor-pointer select-none items-center gap-1.5 text-xs"
                      >
                        <Checkbox
                          id={id}
                          checked={draft.steps.includes(step)}
                          disabled={showArchives}
                          onCheckedChange={() => toggle(draft, step)}
                        />
                        {POST_DRAFT_STEP_LABELS[step]}
                      </label>
                    );
                  })}
                </div>

                <div className="flex shrink-0 items-center gap-1 self-end lg:self-auto">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Copier la description"
                    disabled={!draft.description}
                    onClick={() => void copy(draft)}
                  >
                    {copiedId === draft.id ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Modifier"
                    onClick={() => setEditingId(draft.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  {showArchives ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => update.mutate({ id: draft.id, input: { archived: false } })}
                    >
                      <ArchiveRestore className="h-4 w-4" />
                      Restaurer
                    </Button>
                  ) : (
                    // Toujours cliquable — on archive aussi une publication abandonnée —
                    // mais vert seulement quand tout est coché : c'est le signal attendu.
                    <Button
                      variant={complete ? 'default' : 'outline'}
                      size="sm"
                      className={cn(
                        complete && 'bg-[var(--positive)] text-white hover:bg-[var(--positive)]/90',
                      )}
                      title={
                        complete
                          ? 'Tout est fait : archiver'
                          : 'Archiver sans tout cocher (ne compte pas comme publiée)'
                      }
                      onClick={() => update.mutate({ id: draft.id, input: { archived: true } })}
                    >
                      <Archive className="h-4 w-4" />
                      Archiver
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </Card>
      )}

      <Fab label="Nouvelle publication" icon={Plus} onClick={() => setDialogOpen(true)} />

      <PostDraftDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <PostDraftDialog
        open={editing !== null}
        onOpenChange={(value) => !value && setEditingId(null)}
        draft={editing}
      />
    </div>
  );
};
