import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import {
  usePostDrafts,
  useUpdatePostDraft,
} from '../../application/postDraft/usecases/usePostDrafts.ts';
import { localToday, shiftDate } from '../../application/planning/usecases/usePlanning.ts';
import {
  localDateOf,
  rescheduleOnDay,
  type PostDraft,
} from '../../domain/postDraft/entities/PostDraft.ts';
import { cn } from '../../shared/cn.ts';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { Fab } from '../components/Fab.tsx';
import { Block } from '../dashboard/Block.tsx';
import { PageAlerts } from '../components/PageAlerts.tsx';
import { PostDraftDialog } from '../components/publications/PostDraftDialog.tsx';
import { ScheduleShortDialog } from '../components/publications/ScheduleShortDialog.tsx';
import { ShortTile } from '../components/publications/ShortTile.tsx';
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
 * Production → Verticaux (ex-Shorts, ex-Publications) : **un couloir par jour**, dans l'ordre du calendrier.
 *
 * Un short se prépare en deux temps : le **titre**, noté en vitesse pour savoir à peu près
 * ce qui sort quand, puis la **vidéo** — glissée sur la ligne, ou envoyée par l'outil de
 * montage. Avec une heure et ses plateformes (`ScheduleShortDialog`), il part tout seul à
 * l'heure dite sur YouTube, Instagram et TikTok (`ShortStrip` dit où il en est).
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
export const ShortsPage = () => {
  const { data: active = [], isSuccess: activeLoaded } = usePostDrafts(false);
  const { data: archived = [], isSuccess: archivedLoaded } = usePostDrafts(true);
  const update = useUpdatePostDraft();
  const [createFor, setCreateFor] = useState<string | null | undefined>(undefined);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [schedulingId, setSchedulingId] = useState<string | null>(null);
  const today = localToday();
  /** `?publication=<id>` : venu d'une fiche de vidéo, on s'ouvre sur cette publication. */
  const [searchParams] = useSearchParams();
  const targetIds = useMemo(
    () => (searchParams.get('publication') ?? '').split(',').filter(Boolean),
    [searchParams],
  );
  const targetId = targetIds[0] ?? null;

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
  const scheduling = drafts.find((draft) => draft.id === schedulingId) ?? null;

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
    const container = scrollRef.current;
    if (positioned.current || !loaded || !container || !todayRef.current) return;
    const target = targetId
      ? container.querySelector<HTMLElement>(`[data-publication-id="${CSS.escape(targetId)}"]`)
      : null;
    container.scrollTop = target
      ? container.scrollTop +
        target.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        48
      : todayRef.current.offsetTop;
    positioned.current = true;
  }, [loaded, targetId]);

  // L'écriture est optimiste (`useUpdatePostDraft`) : la ligne change de couloir au lâcher.
  const { drag, start } = useDraftDrag(scrollRef, (id, day) => {
    const draft = drafts.find((item) => item.id === id);
    if (!draft || draft.archivedAt || draft.plannedDate === day) return;
    // Une programmation suit son couloir, à la même heure ; « Sans date » la retire. Une
    // mise en ligne déjà lancée ne bouge plus : seule la date affichée change.
    const reschedule =
      draft.scheduledAt && !draft.publishStartedAt
        ? { scheduledAt: day ? rescheduleOnDay(draft.scheduledAt, day) : null }
        : {};
    update.mutate({ id, input: { plannedDate: day, ...reschedule } });
  });
  const dropHighlight = 'bg-primary/10 ring-2 ring-inset ring-primary';

  /** Une grille de grandes tuiles : de 2 colonnes au téléphone à 6 sur grand écran. */
  const tiles = (items: PostDraft[]) => (
    <div className="grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
      {items.map((draft) => (
        <ShortTile
          key={draft.id}
          draft={draft}
          onEdit={() => setEditingId(draft.id)}
          highlighted={targetIds.includes(draft.id)}
          dragging={drag?.id === draft.id}
          onDragStart={draft.archivedAt ? undefined : (event) => start(event, draft)}
        />
      ))}
    </div>
  );

  /**
   * Plus de couloirs : une galerie qui défile, les jours **avec** verticaux en sections (titre
   * du jour puis tuiles), les jours vides à venir regroupés en puces cliquables — c'est là
   * qu'on lit « quels jours n'ont rien ? » sans qu'un jour vide prenne une ligne entière.
   * Les jours passés vides sont omis.
   */
  type Segment = { kind: 'day'; day: string; items: PostDraft[] } | { kind: 'gap'; day: string };
  const segments = days.flatMap((day): Segment[] => {
    const items = byDay.get(day) ?? [];
    if (items.length > 0) return [{ kind: 'day', day, items }];
    if (day < today) return [];
    return [{ kind: 'gap', day }];
  });
  const anchorDay = segments.find((segment) => segment.day >= today)?.day ?? null;
  const gaps = (list: string[]) => (
    <div className="flex flex-wrap gap-2 px-3 py-2">
      {list.map((day) => (
        <button
          key={day}
          type="button"
          data-drop-day={day}
          onClick={() => setCreateFor(day)}
          title={`Ajouter un vertical le ${DAY_MONTH.format(at(day))}`}
          className={cn(
            'flex items-center gap-1.5 rounded-full border border-dashed px-3 py-1 text-xs',
            day === today
              ? 'border-[var(--today)] text-[var(--today)]'
              : 'border-[var(--expense)]/60 text-[var(--expense)]',
            drag?.day === day && dropHighlight,
          )}
        >
          <Plus className="h-3 w-3" />
          <span className="capitalize">{WEEKDAY.format(at(day)).replace('.', '')}</span>
          <span className="tabular">{DAY_MONTH.format(at(day))}</span>
        </button>
      ))}
    </div>
  );
  // Les jours vides consécutifs forment une seule rangée de puces.
  const blocks: Array<
    { kind: 'day'; day: string; items: PostDraft[] } | { kind: 'gaps'; days: string[] }
  > = [];
  for (const segment of segments) {
    const last = blocks.at(-1);
    if (segment.kind === 'gap') {
      if (last?.kind === 'gaps') last.days.push(segment.day);
      else blocks.push({ kind: 'gaps', days: [segment.day] });
    } else blocks.push(segment);
  }

  return (
    <div className={cn('space-y-4', drag && 'cursor-grabbing select-none')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">Verticaux</h1>
          <p className="text-sm text-muted-foreground">
            Un couloir par jour, une tuile par vertical. Survole pour lire le titre, clique pour
            modifier, glisse la vidéo sur la tuile : elle part toute seule sur YouTube, Instagram et
            TikTok à l’heure choisie. Ce qui est paru se lit dans{' '}
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
            Nouveau vertical
          </Button>
        </div>
      </div>

      <PageAlerts path="/shorts" />

      {/* Les verticaux qui demandent du travail se préparent dans Vidéos (format « Vertical ») :
          ce planning ne montre qu'eux. Ici, ce sont surtout les verticaux générés. */}
      <Block id="production.short.gantt" />

      {undated.length > 0 && (
        <Card
          data-drop-day=""
          className={cn('overflow-hidden', drag?.day === null && dropHighlight)}
        >
          <p className="border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground">
            Sans date ({undated.length})
          </p>
          {tiles(undated)}
        </Card>
      )}

      {/* Le défilement est propre à la galerie : l'en-tête et les alertes restent en place,
          et « s'ouvrir sur aujourd'hui » ne dépend pas de la hauteur de ce qui précède. */}
      <Card ref={scrollRef} className="relative max-h-[calc(100dvh-14rem)] overflow-y-auto">
        {blocks.map((block) => {
          if (block.kind === 'gaps') {
            const first = block.days[0]!;
            return (
              <div key={`gap-${first}`} ref={first === anchorDay ? todayRef : undefined}>
                {gaps(block.days)}
              </div>
            );
          }
          const { day, items } = block;
          const isToday = day === today;
          return (
            <section
              key={day}
              ref={day === anchorDay ? todayRef : undefined}
              data-drop-day={day}
              className={cn('border-b border-border', drag?.day === day && dropHighlight)}
            >
              <div className="flex items-center gap-2 px-4 pt-3">
                <h2
                  className={cn(
                    'text-sm font-semibold capitalize',
                    isToday && 'text-[var(--today)]',
                    day < today && 'text-muted-foreground',
                  )}
                >
                  {WEEKDAY.format(at(day)).replace('.', '')} {DAY_MONTH.format(at(day))}
                  {isToday && ' · aujourd’hui'}
                </h2>
                <span className="text-xs text-muted-foreground">{items.length}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="ml-auto h-7 w-7 text-muted-foreground"
                  title={`Ajouter un vertical le ${DAY_MONTH.format(at(day))}`}
                  onClick={() => setCreateFor(day)}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
              {tiles(items)}
            </section>
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

      <Fab label="Nouveau vertical" icon={Plus} onClick={() => setCreateFor(today)} />

      <PostDraftDialog
        open={createFor !== undefined}
        onOpenChange={(value) => !value && setCreateFor(undefined)}
        defaultDate={createFor ?? null}
      />
      <PostDraftDialog
        open={editing !== null}
        onOpenChange={(value) => !value && setEditingId(null)}
        draft={editing}
        today={today}
        onSchedule={() => {
          setSchedulingId(editingId);
          setEditingId(null);
        }}
      />
      <ScheduleShortDialog
        draft={scheduling}
        onOpenChange={(value) => !value && setSchedulingId(null)}
      />
    </div>
  );
};
