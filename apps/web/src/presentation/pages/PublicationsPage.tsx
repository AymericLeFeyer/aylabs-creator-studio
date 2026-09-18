import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, Check, Copy, Images, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  useDeletePostDraft,
  usePostDrafts,
} from '../../application/postDraft/usecases/usePostDrafts.ts';
import { localToday } from '../../application/planning/usecases/usePlanning.ts';
import { daysUntil, type PostDraft } from '../../domain/postDraft/entities/PostDraft.ts';
import { formatDate } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { Fab } from '../components/Fab.tsx';
import { PostDraftDialog } from '../components/publications/PostDraftDialog.tsx';

/** « Aujourd'hui », « Demain », « dans 5 jours », « il y a 2 jours ». */
const relative = (days: number): string => {
  if (days === 0) return 'Aujourd’hui';
  if (days === 1) return 'Demain';
  if (days > 1) return `Dans ${days} jours`;
  if (days === -1) return 'Hier';
  return `Il y a ${-days} jours`;
};

/**
 * Production → Publications : les **brouillons** de publication Instagram.
 *
 * Un titre, une description, une date prévue — de quoi organiser son calendrier de
 * publication et rien d'autre. C'est la préparation ; ce qui est réellement paru se lit
 * dans Audience → Instagram, et les deux écrans ne se mélangent pas.
 *
 * La liste suit le calendrier (date prévue la plus proche en tête, sans date à la fin),
 * si bien qu'une date **dépassée** remonte d'elle-même en tête, en rouge : soit la
 * publication est sortie et le brouillon peut partir, soit elle est à replanifier.
 *
 * La description se **copie** d'un clic : elle est écrite ici pour être collée dans
 * Instagram, et la sélectionner à la main dans une carte tronquée est un piège.
 */
export const PublicationsPage = () => {
  const { data: drafts = [], isLoading } = usePostDrafts();
  const remove = useDeletePostDraft();
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
      // Presse-papier refusé (contexte non sécurisé) : rien à faire de plus, le texte
      // reste lisible et sélectionnable dans le formulaire.
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">Publications</h1>
          <p className="text-sm text-muted-foreground">
            Les publications Instagram à venir, en brouillon. Ce qui est paru se lit dans{' '}
            <Link to="/instagram" className="underline underline-offset-2">
              Audience → Instagram
            </Link>
            .
          </p>
        </div>
        <Button size="sm" className="hidden lg:inline-flex" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouveau brouillon
        </Button>
      </div>

      {!isLoading && drafts.length === 0 ? (
        <Card className="space-y-3 p-6 text-center">
          <Images className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Aucun brouillon</p>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Note une publication à venir — un titre suffit, la légende et la date peuvent attendre.
          </p>
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            Nouveau brouillon
          </Button>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {drafts.map((draft) => {
            const days = draft.plannedDate ? daysUntil(draft.plannedDate, today) : null;
            const late = days !== null && days < 0;
            return (
              <Card
                key={draft.id}
                className={cn(
                  'flex min-w-0 flex-col gap-2 p-4',
                  late && 'border-[var(--negative)]/50',
                )}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={draft.title}>
                      {draft.title}
                    </p>
                    <p
                      className={cn(
                        'flex items-center gap-1 text-xs text-muted-foreground',
                        late && 'font-medium text-[var(--negative)]',
                        days === 0 && 'font-medium text-[var(--today)]',
                      )}
                    >
                      <CalendarDays className="h-3 w-3 shrink-0" aria-hidden />
                      {draft.plannedDate && days !== null
                        ? `${formatDate(draft.plannedDate)} · ${relative(days)}`
                        : 'Pas de date prévue'}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
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
                      className="h-7 w-7"
                      title="Modifier"
                      onClick={() => setEditingId(draft.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      title="Supprimer"
                      onClick={() => {
                        if (window.confirm(`Supprimer le brouillon « ${draft.title} » ?`)) {
                          remove.mutate(draft.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>

                {draft.description ? (
                  <p className="line-clamp-6 whitespace-pre-line break-words text-sm text-muted-foreground">
                    {draft.description}
                  </p>
                ) : (
                  <p className="text-sm italic text-muted-foreground">Pas encore de description</p>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Fab label="Nouveau brouillon" icon={Plus} onClick={() => setDialogOpen(true)} />

      <PostDraftDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      <PostDraftDialog
        open={editing !== null}
        onOpenChange={(value) => !value && setEditingId(null)}
        draft={editing}
      />
    </div>
  );
};
