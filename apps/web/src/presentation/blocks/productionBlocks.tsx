import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  Clapperboard,
  Clock,
  ExternalLink,
  ListChecks,
  Pause,
  Rocket,
  Timer,
} from 'lucide-react';
import {
  useProductionOverview,
  useProductions,
  useProductionSteps,
  useTimeEntries,
} from '../../application/production/usecases/useProductions.ts';
import { localToday, shiftDate } from '../../application/planning/usecases/usePlanning.ts';
import { useDeleteIdea } from '../../application/idea/usecases/useIdeas.ts';
import type { Idea } from '../../domain/idea/entities/Idea.ts';
import type { Production, ProductionFormat } from '../../domain/production/entities/Production.ts';
import {
  progressCounts,
  STATUS_COLORS,
  STATUS_LABELS,
} from '../../domain/production/entities/Production.ts';
import type { ProductionStep } from '../../domain/production/entities/ProductionStep.ts';
import { entryMinutes, formatDuration } from '../../domain/production/entities/TimeEntry.ts';
import { formatDate, formatNumber, toIsoDate } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';
import { usePreferences } from '../hooks/usePreferences.ts';
import { StatCard } from '../components/StatCard.tsx';
import { StatDetails, type DetailRow } from '../components/StatDetails.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { ProductionCard } from '../components/production/ProductionCard.tsx';
import { ProductionGantt } from '../components/production/ProductionGantt.tsx';
import { IdeaBox } from '../components/production/IdeaBox.tsx';
import { StepAveragesCard } from '../components/production/StepAveragesCard.tsx';
import { StepTodosDialog } from '../components/production/StepTodosDialog.tsx';
import { StartTimerDialog } from '../components/production/StartTimerDialog.tsx';
import { SlotSummary } from '../components/production/SlotSummary.tsx';
import { ProductionDialog } from '../components/forms/ProductionDialog.tsx';
import { PRODUCTION_COPY } from './productionCopy.ts';

/**
 * Les blocs de production, **paramétrés par format** comme l'écran qu'ils composent :
 * « Vidéos » et « Shorts & Réels » posent chacun les leurs, et le dashboard peut accueillir
 * les deux. La file, ses chiffres et ses créneaux ne parlent que du format demandé.
 */
type FormatProps = { format: ProductionFormat };

const PENDING = '…';

/** « 4 h 30 » — la charge d'une semaine se lit en heures, pas en minutes. */
const formatLoad = (minutes: number): string =>
  minutes === 0 ? 'aucun horaire posé' : formatDuration(minutes);

const suffix = (format: ProductionFormat) => (format === 'short' ? ' · shorts' : ' · vidéos');

export type ProductionStatKey = 'inQueue' | 'progress' | 'next' | 'week' | 'late' | 'paused';

/** Une vidéo de la file en ligne de détail : pastille de statut, titre, avancement. */
const productionRow = (production: Production, sub?: string): DetailRow => {
  const { done, total } = progressCounts(production);
  return {
    key: production.id,
    label: production.title,
    color: STATUS_COLORS[production.status],
    sub: sub ?? STATUS_LABELS[production.status],
    value: total > 0 ? `${Math.round((done / total) * 100)} %` : '—',
  };
};

const byPlannedDate = (a: Production, b: Production) =>
  (a.plannedDate ?? '9999').localeCompare(b.plannedDate ?? '9999');

/**
 * Les six chiffres de la file. Aucun ne dépend d'une période : ce sont des états. Chacun
 * déplie **les vidéos qu'il compte**, lues dans la même file que l'API a comptée.
 */
export const ProductionStatCard = ({ format, stat }: FormatProps & { stat: ProductionStatKey }) => {
  switch (stat) {
    case 'inQueue':
      return <InQueueCard format={format} />;
    case 'progress':
      return <ProgressCard format={format} />;
    case 'next':
      return <NextReleaseCard format={format} />;
    case 'week':
      return <WeekTimeCard format={format} />;
    case 'late':
      return <LateCard format={format} />;
    case 'paused':
      return <PausedCard format={format} />;
  }
};

const InQueueCard = ({ format }: FormatProps) => {
  const { data: overview } = useProductionOverview(format);
  const stats = overview?.stats;
  const queue = overview?.queue ?? [];
  return (
    <StatCard
      label="En cours"
      value={stats ? String(stats.inQueue) : PENDING}
      hint={stats ? `${stats.inProgress} attaquée(s)${suffix(format)}` : undefined}
      icon={<Clapperboard className="h-4 w-4" />}
      details={
        <StatDetails
          title="Pas encore publiées, dans l'ordre de la file"
          rows={queue.map((production) =>
            productionRow(
              production,
              [
                STATUS_LABELS[production.status],
                production.plannedDate && `sortie le ${formatDate(production.plannedDate)}`,
              ]
                .filter(Boolean)
                .join(' · '),
            ),
          )}
          max={8}
          empty="La file est vide."
          note={`« Attaquées » = au statut « ${STATUS_LABELS.in_progress} ». Les idées et les vidéos en pause comptent dans la file.`}
        />
      }
    />
  );
};

const ProgressCard = ({ format }: FormatProps) => {
  const { data: overview } = useProductionOverview(format);
  const stats = overview?.stats;
  const queue = useMemo(
    () =>
      [...(overview?.queue ?? [])].sort((a, b) => {
        const pa = progressCounts(a);
        const pb = progressCounts(b);
        return pb.done / (pb.total || 1) - pa.done / (pa.total || 1);
      }),
    [overview],
  );
  return (
    <StatCard
      label="Avancement moyen"
      value={stats ? `${Math.round(stats.averageProgress * 100)} %` : PENDING}
      hint={`étapes et tâches cochées${suffix(format)}`}
      icon={<ListChecks className="h-4 w-4" />}
      details={
        <StatDetails
          title="Vidéo par vidéo"
          rows={queue.map((production) => {
            const { done, total } = progressCounts(production);
            return productionRow(production, `${done} sur ${total} coché(s)`);
          })}
          max={8}
          empty="La file est vide."
          note="Moyenne simple des vidéos de la file. Chaque étape et chaque tâche compte pour un point : une étape à cinq tâches en vaut six."
        />
      }
    />
  );
};

const NextReleaseCard = ({ format }: FormatProps) => {
  const { data: overview } = useProductionOverview(format);
  const stats = overview?.stats;
  const today = localToday();
  const upcoming = useMemo(
    () =>
      (overview?.queue ?? [])
        .filter((production) => production.plannedDate !== null && production.plannedDate >= today)
        .sort(byPlannedDate),
    [overview, today],
  );
  const undated = (overview?.queue ?? []).filter((production) => !production.plannedDate).length;
  return (
    <StatCard
      label="Prochaine sortie"
      value={stats?.nextRelease ? formatDate(stats.nextRelease.date) : '—'}
      hint={stats?.nextRelease?.title ?? 'aucune date posée'}
      icon={<Rocket className="h-4 w-4" />}
      details={
        <StatDetails
          title="Les prochaines sorties prévues"
          rows={upcoming.map((production) =>
            productionRow(
              production,
              `${formatDate(production.plannedDate!)} · ${STATUS_LABELS[production.status]}`,
            ),
          )}
          empty="Aucune sortie datée à venir."
          note={
            undated > 0
              ? `${undated} vidéo(s) de la file sans date de sortie.`
              : 'Toutes les vidéos de la file ont une date.'
          }
        />
      }
    />
  );
};

/**
 * Les sessions des 7 derniers jours, regroupées par vidéo. Relues à part : l'aperçu n'en
 * donne que le total, et c'est « sur quoi est parti ce temps » qu'on vient chercher.
 */
const WeekTimeCard = ({ format }: FormatProps) => {
  const { data: overview } = useProductionOverview(format);
  const stats = overview?.stats;
  const today = localToday();
  const { data: entries = [] } = useTimeEntries({ from: shiftDate(today, -6), to: today });
  const { data: productions = [] } = useProductions();
  const rows = useMemo(() => {
    const byId = new Map(productions.map((production) => [production.id, production]));
    const totals = new Map<string, number>();
    for (const entry of entries) {
      const production = byId.get(entry.productionId);
      if (production && production.format !== format) continue;
      totals.set(entry.productionId, (totals.get(entry.productionId) ?? 0) + entryMinutes(entry));
    }
    return [...totals.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, minutes]): DetailRow => {
        const production = byId.get(id);
        return {
          key: id,
          label: production?.title ?? 'Vidéo supprimée',
          color: production ? STATUS_COLORS[production.status] : undefined,
          sub: production ? STATUS_LABELS[production.status] : undefined,
          value: formatDuration(minutes),
        };
      });
  }, [entries, productions, format]);
  return (
    <StatCard
      label="Temps cette semaine"
      value={stats ? formatDuration(stats.weekTrackedMinutes) : PENDING}
      hint={`${formatLoad(overview?.weekLoadMinutes ?? 0)} planifié${suffix(format)}`}
      icon={<Timer className="h-4 w-4" />}
      accent={stats && stats.weekTrackedMinutes > 0 ? 'var(--positive)' : undefined}
      details={
        <StatDetails
          title="Temps passé sur les 7 derniers jours, par vidéo"
          rows={rows}
          max={8}
          empty="Aucune session enregistrée sur les 7 derniers jours."
          note={`Sessions chronométrées ou saisies, chronomètre en cours compris. « Planifié » : les créneaux posés sur la semaine (${formatLoad(overview?.weekLoadMinutes ?? 0)}).`}
        />
      }
    />
  );
};

const LateCard = ({ format }: FormatProps) => {
  const { data: overview } = useProductionOverview(format);
  const stats = overview?.stats;
  const today = localToday();
  const weekEnd = shiftDate(today, 6);
  const queue = overview?.queue ?? [];
  const late = queue
    .filter((production) => production.plannedDate !== null && production.plannedDate < today)
    .sort(byPlannedDate);
  const dueSoon = queue
    .filter(
      (production) =>
        production.plannedDate !== null &&
        production.plannedDate >= today &&
        production.plannedDate <= weekEnd,
    )
    .sort(byPlannedDate);
  return (
    <StatCard
      label="En retard"
      value={stats ? String(stats.late) : PENDING}
      hint={stats ? `${stats.dueThisWeek} à sortir cette semaine${suffix(format)}` : undefined}
      icon={<CalendarClock className="h-4 w-4" />}
      accent={stats && stats.late > 0 ? 'var(--negative)' : undefined}
      details={
        <StatDetails
          title="Sortie visée dépassée, pas encore publiées"
          rows={[
            ...late.map((production) => ({
              ...productionRow(
                production,
                `prévue le ${formatDate(production.plannedDate!)} · ${STATUS_LABELS[production.status]}`,
              ),
              tone: 'danger' as const,
            })),
            ...dueSoon.map((production) =>
              productionRow(
                production,
                `à sortir le ${formatDate(production.plannedDate!)} · cette semaine`,
              ),
            ),
          ]}
          max={8}
          empty="Rien en retard, rien à sortir cette semaine."
          note="En rouge, les retards ; ensuite, ce qui doit sortir dans les 7 jours."
        />
      }
    />
  );
};

const PausedCard = ({ format }: FormatProps) => {
  const { data: overview } = useProductionOverview(format);
  const stats = overview?.stats;
  const paused = (overview?.queue ?? []).filter((production) => production.status === 'paused');
  return (
    <StatCard
      label="Bloquées"
      value={stats ? String(stats.paused) : PENDING}
      hint={`en attente de quelqu'un d'autre${suffix(format)}`}
      icon={<Pause className="h-4 w-4" />}
      accent={stats && stats.paused > 0 ? 'var(--expense)' : undefined}
      details={
        <StatDetails
          title="En pause, et pourquoi"
          rows={paused.map((production) =>
            productionRow(
              production,
              [
                production.pausedReason || 'raison non précisée',
                production.pausedAt && `depuis le ${formatDate(production.pausedAt)}`,
              ]
                .filter(Boolean)
                .join(' · '),
            ),
          )}
          empty="Aucune vidéo bloquée."
        />
      }
    />
  );
};

/** Toute la file, tous formats : la carte « En production » d'avant le dashboard composé. */
export const ProductionQueueCountCard = () => {
  const { data: production } = useProductionOverview();
  const queue = production?.queue ?? [];
  const byFormat = (['video', 'short'] as const).map((format) => ({
    format,
    items: queue.filter((item) => item.format === format),
  }));
  return (
    <StatCard
      label="En production"
      value={formatNumber(queue.length)}
      hint="vidéos et shorts pas encore publiés"
      icon={<Clapperboard className="h-4 w-4" />}
      details={
        <StatDetails
          title="Par format et par statut"
          rows={byFormat.map(({ format, items }) => ({
            key: format,
            label: format === 'short' ? 'Shorts & Réels' : 'Vidéos',
            sub: (['idea', 'in_progress', 'paused'] as const)
              .map((status) => {
                const count = items.filter((item) => item.status === status).length;
                return count > 0 ? `${count} ${STATUS_LABELS[status].toLowerCase()}` : null;
              })
              .filter(Boolean)
              .join(' · '),
            value: formatNumber(items.length),
          }))}
          empty="La file est vide."
        />
      }
    />
  );
};

/** « Qu'est-ce qui sort quand » : la file et les terminées, sur un même calendrier. */
export const ProductionGanttBlock = ({ format }: FormatProps) => {
  const { data: overview } = useProductionOverview(format);
  const { data: done = [] } = useProductions({ statuses: ['done'], formats: [format] });
  return <ProductionGantt productions={[...(overview?.queue ?? []), ...done]} />;
};

/** Les créneaux à venir du format, tous projets confondus : ce que dit l'agenda. */
export const UpcomingSlotsBlock = ({ format }: FormatProps) => {
  const { data: overview } = useProductionOverview(format);
  const today = toIsoDate(new Date());
  const slots = overview?.upcomingSlots ?? [];
  return (
    <Card className="h-fit">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarClock className="h-4 w-4" />
          Prochains créneaux
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {slots.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aucun créneau posé sur les 14 prochains jours.
          </p>
        ) : (
          slots.map((slot) => (
            <Link
              key={slot.id}
              to={`/production/${slot.productionId}`}
              // Le créneau du jour se détache de la pile : c'est le seul de la liste sur
              // lequel on peut encore agir maintenant.
              className={cn(
                'flex items-start gap-2 rounded-md p-1.5 text-sm transition-colors',
                slot.date === today
                  ? 'border-l-2 border-[var(--negative)] bg-accent/60 pl-2 hover:bg-accent'
                  : 'hover:bg-muted/60',
              )}
            >
              <span
                className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: slot.channelColor ?? 'var(--muted-foreground)' }}
                aria-hidden
              />
              <SlotSummary slot={slot} showProduction />
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
};

export const StepAveragesBlock = ({ format }: FormatProps) => {
  const { data: overview } = useProductionOverview(format);
  return (
    <StepAveragesCard
      averages={overview?.stepAverages ?? []}
      video={overview?.averageVideoMinutes ?? null}
      publishedLabel={PRODUCTION_COPY[format].published}
    />
  );
};

/**
 * Le carnet d'idées, **avec sa promotion** : « en faire une vidéo » ouvre le formulaire ici
 * même, pour que le bloc marche aussi sur le dashboard. L'idée n'est retirée qu'une fois
 * la vidéo réellement créée.
 */
export const IdeaBoxBlock = ({ format }: FormatProps) => {
  const deleteIdea = useDeleteIdea();
  const [promoted, setPromoted] = useState<Idea | null>(null);
  return (
    <>
      <IdeaBox format={format} onPromote={setPromoted} />
      <ProductionDialog
        open={promoted !== null}
        onOpenChange={(open) => !open && setPromoted(null)}
        defaultTitle={promoted?.text}
        defaultFormat={format}
        onCreated={() => {
          if (promoted) deleteIdea.mutate(promoted.id);
          setPromoted(null);
        }}
      />
    </>
  );
};

/**
 * La file d'attente, avec ses modales (tâches d'une étape, chronomètre, fiche) : tout ce
 * qu'on y fait se fait sans quitter le bloc.
 *
 * Une vidéo **pas encore commencée** est repliée d'office : à 0 %, une carte détaillée n'a
 * rien à montrer. Ce n'est qu'un défaut — le chevron rouvre la carte (`exceptions`), et le
 * réglage global l'emporte dès qu'on le change.
 */
export const ProductionQueueBlock = ({ format }: FormatProps) => {
  const { data: overview } = useProductionOverview(format);
  const { data: steps = [] } = useProductionSteps();
  const { preferences } = usePreferences();

  /**
   * Les vidéos en péril, lues dans les alertes de l'API et non recalculées ici : c'est la
   * même règle qui allume la pastille rouge du menu.
   */
  const urgentIds = useMemo(
    () =>
      new Set(
        (overview?.alerts ?? [])
          .filter((alert) => alert.kind === 'production_urgent')
          .map((alert) => alert.productionId),
      ),
    [overview],
  );

  const [openStep, setOpenStep] = useState<{ production: Production; step: ProductionStep } | null>(
    null,
  );
  const [timerFor, setTimerFor] = useState<Production | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exceptions, setExceptions] = useState<Set<string>>(new Set());

  // Le réglage global vide les exceptions : dérivé pendant le rendu, pas dans un effet.
  const [knownCompact, setKnownCompact] = useState(preferences.compactQueue);
  if (knownCompact !== preferences.compactQueue) {
    setKnownCompact(preferences.compactQueue);
    setExceptions(new Set());
  }

  const queue = overview?.queue ?? [];
  const editing = queue.find((production) => production.id === editingId) ?? null;

  const isCompact = (production: Production) => {
    const byDefault = preferences.compactQueue || progressCounts(production).done === 0;
    return exceptions.has(production.id) ? !byDefault : byDefault;
  };

  const toggleException = (id: string) =>
    setExceptions((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="min-w-0 space-y-2.5">
      {/* Triée par sortie visée côté API : l'échéance la plus proche en tête. */}
      {queue.map((production) => (
        <ProductionCard
          key={production.id}
          production={production}
          steps={steps}
          highlighted={production.id === overview?.nextId}
          urgent={urgentIds.has(production.id)}
          timerRunning={overview?.running?.productionId === production.id}
          compact={isCompact(production)}
          onToggleCompact={() => toggleException(production.id)}
          onOpenStep={(step) => setOpenStep({ production, step })}
          onStartTimer={() => setTimerFor(production)}
          onEdit={() => setEditingId(production.id)}
        />
      ))}
      {queue.length === 0 && (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Rien en cours. Tout est publié.
        </Card>
      )}

      {openStep && (
        <StepTodosDialog
          open
          onOpenChange={(value) => !value && setOpenStep(null)}
          // La liste vient de l'aperçu rechargé : cocher une tâche doit se voir dans la
          // modale restée ouverte.
          production={
            queue.find((item) => item.id === openStep.production.id) ?? openStep.production
          }
          step={openStep.step}
        />
      )}
      <StartTimerDialog
        open={timerFor !== null}
        onOpenChange={(value) => !value && setTimerFor(null)}
        production={timerFor}
      />
      <ProductionDialog
        open={editing !== null}
        onOpenChange={(value) => !value && setEditingId(null)}
        production={editing}
      />
    </div>
  );
};

export const ProductionDoneBlock = ({ format }: FormatProps) => {
  const { data: done = [] } = useProductions({ statuses: ['done'], formats: [format] });
  if (done.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        {PRODUCTION_COPY[format].emptyDone}
      </Card>
    );
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {done.map((production) => (
        <Card key={production.id} className="overflow-hidden">
          {production.videoThumbnailUrl && (
            <img
              src={production.videoThumbnailUrl}
              alt=""
              className="aspect-video w-full object-cover"
            />
          )}
          <div className="space-y-2 p-4">
            <Link to={`/production/${production.id}`} className="block font-medium hover:underline">
              <span className="line-clamp-2">{production.videoTitle ?? production.title}</span>
            </Link>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{production.channelName ?? 'Sans chaîne'}</Badge>
              {production.plannedDate && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" aria-hidden />
                  {formatDate(production.plannedDate)}
                </span>
              )}
              {production.trackedMinutes > 0 && (
                <span className="flex items-center gap-1" title="Temps passé au total">
                  <Timer className="h-3 w-3" aria-hidden />
                  {formatDuration(production.trackedMinutes)}
                </span>
              )}
              {production.videoExternalId && (
                <a
                  href={`https://www.youtube.com/watch?v=${production.videoExternalId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden />
                  YouTube
                </a>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
};
