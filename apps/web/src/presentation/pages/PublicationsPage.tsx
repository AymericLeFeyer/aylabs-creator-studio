import { useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, Check, Copy, GripVertical, Pencil, Plus } from 'lucide-react';
import {
  usePostDrafts,
  useUpdatePostDraft,
} from '../../application/postDraft/usecases/usePostDrafts.ts';
import { localToday, shiftDate } from '../../application/planning/usecases/usePlanning.ts';
import {
  isPostDraftComplete,
  localDateOf,
  POST_DRAFT_STEP_LABELS,
  POST_DRAFT_STEPS,
  toggleStep,
  type PostDraft,
  type PostDraftStep,
} from '../../domain/postDraft/entities/PostDraft.ts';
import { cn } from '../../shared/cn.ts';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Fab } from '../components/Fab.tsx';
import { PageAlerts } from '../components/PageAlerts.tsx';
import { PostDraftDialog } from '../components/publications/PostDraftDialog.tsx';
import { useDraftDrag } from '../components/publications/useDraftDrag.ts';

/** Jours toujours affichés de part et d'autre d'aujourd'hui, même sans rien dedans. */
const DAYS_BEFORE = 30;
const DAYS_AFTER = 60;
/** Garde-fou : une date saisie de travers ne doit pas produire mille couloirs. */
const MAX_SPAN = 365;

const WEEKDAY = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const DAY_MONTH = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const at = (date: string) => new Date(`${date}T12:00:00`);

/** Le jour d'une publication : sa date prévue, sinon celui de son archivage. */
const dayOf = (draft: PostDraft): string | null =>
  draft.plannedDate ?? (draft.archivedAt ? localDateOf(draft.archivedAt) : null);

/** Tous les jours de `from` à `to`, dans l'ordre du calendrier. */
const daysBetween = (from: string, to: string): string[] => {
  const days: string[] = [];
  for (let day = from; day <= to && days.length <= MAX_SPAN * 2; day = shiftDate(day, 1)) {
    days.push(day);
  }
  return days;
};

/**
 * Production → Publications : **un couloir par jour**, dans l'ordre du calendrier.
 *
 * La question de l'écran est « quels jours n'ont rien ? » — une liste triée ne la pose pas,
 * un trou de trois jours y est invisible. Chaque jour a donc sa ligne, **vide comprise** :
 * un jour à venir sans rien est signalé en orange, un jour passé sans rien reste en creux.
 *
 * L'écran **s'ouvre sur aujourd'hui** : on remonte pour les jours passés, on descend pour
 * les jours à venir. Les couloirs couvrent au moins 30 jours avant et 60 après, élargis
 * jusqu'à la publication la plus lointaine (365 jours au plus de chaque côté).
 *
 * Les publications **archivées restent visibles**, grisées, à leur jour : c'est ce qui dit
 * qu'un jour passé a bien eu sa publication. Une publication archivée sans date prend le
 * jour de son archivage. Celles qui n'ont **pas encore de date** attendent au-dessus des
 * couloirs.
 *
 * Six cases par publication ; tout coché, le bouton d'archivage passe au vert et archive
 * **sans confirmation**. C'est l'archivage d'une publication complète qui remet à zéro le
 * compteur « -X » du menu. Ce qui est réellement paru se lit dans Audience → Instagram.
 *
 * Une publication **se glisse d'un couloir à l'autre** par sa poignée : c'est ce qui change
 * sa date prévue, sans ouvrir la modale. La lâcher sur « Sans date » la retire du
 * calendrier. Les archivées n'ont pas de poignée — elles sont figées, comme leurs cases.
 */
export const PublicationsPage = () => {
  const { data: active = [], isSuccess: activeLoaded } = usePostDrafts(false);
  const { data: archived = [], isSuccess: archivedLoaded } = usePostDrafts(true);
  const update = useUpdatePostDraft();
  const [createFor, setCreateFor] = useState<string | null | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const today = localToday();

  // Une même publication peut figurer dans les deux listes le temps d'un aller-retour
  // (archivée à l'instant) : la première occurrence l'emporte.
  const drafts = useMemo(() => {
    const seen = new Set<string>();
    return [...active, ...archived].filter((draft) =>
      seen.has(draft.id) ? false : (seen.add(draft.id), true),
    );
  }, [active, archived]);

  const { days, byDay, undated } = useMemo(() => {
    const map = new Map<string, PostDraft[]>();
    const withoutDate: PostDraft[] = [];
    for (const draft of drafts) {
      const day = dayOf(draft);
      if (!day) {
        withoutDate.push(draft);
        continue;
      }
      map.set(day, [...(map.get(day) ?? []), draft]);
    }
    const dated = [...map.keys()].sort();
    const floor = shiftDate(today, -MAX_SPAN);
    const ceiling = shiftDate(today, MAX_SPAN);
    const first = [dated[0], shiftDate(today, -DAYS_BEFORE)].filter(Boolean).sort()[0]!;
    const last = [dated.at(-1), shiftDate(today, DAYS_AFTER)].filter(Boolean).sort().at(-1)!;
    return {
      days: daysBetween(first < floor ? floor : first, last > ceiling ? ceiling : last),
      byDay: map,
      undated: withoutDate,
    };
  }, [drafts, today]);

  // L'identifiant et non la fiche : après enregistrement la liste est rechargée.
  const editing = drafts.find((draft) => draft.id === editingId) ?? null;

  /**
   * Le défilement s'ouvre **sur aujourd'hui**, une seule fois : une fois les données là,
   * sans quoi les couloirs d'avant n'existent pas encore et la position serait fausse. Le
   * refaire à chaque rendu ramènerait l'écran à aujourd'hui au milieu d'une lecture.
   */
  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const loaded = activeLoaded && archivedLoaded;
  useLayoutEffect(() => {
    if (positioned.current || !loaded || !scrollRef.current || !todayRef.current) return;
    scrollRef.current.scrollTop = todayRef.current.offsetTop;
    positioned.current = true;
  }, [loaded]);

  // L'écriture est optimiste (`useUpdatePostDraft`) : la ligne change de couloir au lâcher.
  const { drag, start } = useDraftDrag(scrollRef, (id, day) => {
    const draft = drafts.find((item) => item.id === id);
    if (!draft || draft.archivedAt || draft.plannedDate === day) return;
    update.mutate({ id, input: { plannedDate: day } });
  });
  const dropHighlight = 'bg-primary/10 ring-2 ring-inset ring-primary';

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

  const row = (draft: PostDraft) => (
    <DraftRow
      key={draft.id}
      draft={draft}
      copied={copiedId === draft.id}
      onCopy={() => void copy(draft)}
      onEdit={() => setEditingId(draft.id)}
      onToggle={(step) =>
        update.mutate({ id: draft.id, input: { steps: toggleStep(draft.steps, step) } })
      }
      onArchive={(value) => update.mutate({ id: draft.id, input: { archived: value } })}
      dragging={drag?.id === draft.id}
      onDragStart={draft.archivedAt ? undefined : (event) => start(event, draft)}
    />
  );

  return (
    <div className={cn('space-y-4', drag && 'cursor-grabbing select-none')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">Publications</h1>
          <p className="text-sm text-muted-foreground">
            Un couloir par jour : on remonte pour le passé, on descend pour la suite. Ce qui est
            paru se lit dans{' '}
            <Link to="/instagram" className="underline underline-offset-2">
              Audience → Instagram
            </Link>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (scrollRef.current && todayRef.current) {
                scrollRef.current.scrollTo({ top: todayRef.current.offsetTop, behavior: 'smooth' });
              }
            }}
          >
            Aujourd’hui
          </Button>
          <Button size="sm" className="hidden lg:inline-flex" onClick={() => setCreateFor(null)}>
            <Plus className="h-4 w-4" />
            Nouvelle publication
          </Button>
        </div>
      </div>

      <PageAlerts path="/publications" />

      {undated.length > 0 && (
        <Card
          data-drop-day=""
          className={cn('overflow-hidden', drag?.day === null && dropHighlight)}
        >
          <p className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
            Sans date ({undated.length})
          </p>
          <div className="divide-y divide-border">{undated.map(row)}</div>
        </Card>
      )}

      {/* Le défilement est propre aux couloirs : l'en-tête et les alertes restent en place,
          et « s'ouvrir sur aujourd'hui » ne dépend pas de la hauteur de ce qui précède. */}
      <Card
        ref={scrollRef}
        className="relative max-h-[calc(100dvh-14rem)] divide-y divide-border overflow-y-auto"
      >
        {days.map((day) => {
          const items = byDay.get(day) ?? [];
          const isToday = day === today;
          const future = day >= today;
          return (
            <div
              key={day}
              ref={isToday ? todayRef : undefined}
              data-drop-day={day}
              className={cn(
                'flex min-h-11',
                isToday && 'bg-[var(--today)]/10',
                drag?.day === day && dropHighlight,
              )}
            >
              {/* Le jour, en colonne collante à gauche : il reste lisible quand un couloir
                  porte plusieurs publications. */}
              <div
                className={cn(
                  'flex w-24 shrink-0 flex-col justify-center border-r border-border px-3 py-2 text-xs sm:w-28',
                  isToday && 'font-semibold text-[var(--today)]',
                  !isToday && day < today && 'text-muted-foreground',
                )}
              >
                <span className="capitalize">{WEEKDAY.format(at(day)).replace('.', '')}</span>
                <span className="tabular">{DAY_MONTH.format(at(day))}</span>
                {isToday && <span className="text-[10px] uppercase">Aujourd’hui</span>}
              </div>

              <div className="group min-w-0 flex-1">
                {items.length > 0 ? (
                  <div className="divide-y divide-border">{items.map(row)}</div>
                ) : (
                  // Un jour vide est l'information que l'écran doit donner : orange s'il
                  // est encore temps d'y mettre quelque chose, en creux sinon.
                  <p
                    className={cn(
                      'flex h-full items-center px-4 py-2 text-xs',
                      future ? 'text-[var(--expense)]' : 'text-muted-foreground/60',
                    )}
                  >
                    {drag?.day === day ? 'Déposer ici' : future ? 'Rien de prévu' : 'Rien'}
                  </p>
                )}
              </div>

              <div className="flex shrink-0 items-center px-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground"
                  title={`Ajouter une publication le ${DAY_MONTH.format(at(day))}`}
                  onClick={() => setCreateFor(day)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </Card>

      {drag &&
        createPortal(
          // Suit le pointeur et annonce où la publication va tomber : sur des couloirs qui
          // défilent, le jour survolé n'est pas toujours celui qu'on croit.
          <div
            className="pointer-events-none fixed z-50 max-w-64 rounded-md border border-border bg-card px-3 py-1.5 text-sm shadow-lg"
            style={{ left: drag.x + 14, top: drag.y + 14 }}
          >
            <p className="truncate font-medium">{drag.title}</p>
            <p className="text-xs text-muted-foreground">
              {drag.day === undefined
                ? 'Lâcher sur un jour'
                : drag.day === null
                  ? '→ Sans date'
                  : `→ ${WEEKDAY.format(at(drag.day)).replace('.', '')} ${DAY_MONTH.format(at(drag.day))}`}
            </p>
          </div>,
          document.body,
        )}

      <Fab label="Nouvelle publication" icon={Plus} onClick={() => setCreateFor(today)} />

      <PostDraftDialog
        open={createFor !== undefined}
        onOpenChange={(value) => !value && setCreateFor(undefined)}
        defaultDate={createFor ?? null}
      />
      <PostDraftDialog
        open={editing !== null}
        onOpenChange={(value) => !value && setEditingId(null)}
        draft={editing}
      />
    </div>
  );
};

interface DraftRowProps {
  draft: PostDraft;
  copied: boolean;
  onCopy: () => void;
  onEdit: () => void;
  onToggle: (step: PostDraftStep) => void;
  onArchive: (archived: boolean) => void;
  dragging: boolean;
  /** Absent sur une publication archivée : elle ne se déplace pas. */
  onDragStart?: (event: PointerEvent) => void;
}

/**
 * Une publication dans son couloir : titre, six cases, actions. Archivée, elle reste là,
 * grisée et figée — seul « Restaurer » la remet en jeu.
 */
const DraftRow = ({
  draft,
  copied,
  onCopy,
  onEdit,
  onToggle,
  onArchive,
  dragging,
  onDragStart,
}: DraftRowProps) => {
  const isArchived = draft.archivedAt !== null;
  const complete = isPostDraftComplete(draft.steps);
  return (
    <div
      className={cn(
        'flex flex-col gap-2 px-4 py-2 lg:flex-row lg:items-center lg:gap-4',
        isArchived && 'opacity-55',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {/* `touch-none` sur la seule poignée : au doigt, le reste de la ligne fait défiler. */}
        {onDragStart ? (
          <span
            role="button"
            aria-label="Déplacer vers un autre jour"
            title="Glisser vers un autre jour"
            onPointerDown={onDragStart}
            className="-ml-2 flex h-8 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground/60 hover:text-foreground active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </span>
        ) : (
          <span className="-ml-2 w-6 shrink-0" />
        )}
        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 text-left"
          title="Modifier"
        >
          <p className={cn('truncate text-sm font-medium', isArchived && 'line-through')}>
            {draft.title}
          </p>
          {draft.description && (
            <p className="truncate text-xs text-muted-foreground">{draft.description}</p>
          )}
        </button>
      </div>

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
                disabled={isArchived}
                onCheckedChange={() => onToggle(step)}
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
          onClick={onCopy}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Modifier" onClick={onEdit}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        {isArchived ? (
          <Button variant="outline" size="sm" onClick={() => onArchive(false)}>
            <ArchiveRestore className="h-4 w-4" />
            Restaurer
          </Button>
        ) : (
          // Toujours cliquable — on archive aussi un abandon — mais vert seulement quand
          // tout est coché : c'est le signal attendu.
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
            onClick={() => onArchive(true)}
          >
            <Archive className="h-4 w-4" />
            Archiver
          </Button>
        )}
      </div>
    </div>
  );
};
