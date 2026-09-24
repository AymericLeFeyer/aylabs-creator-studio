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
} from '../../application/production/usecases/useProductions.ts';
import { useDeleteIdea } from '../../application/idea/usecases/useIdeas.ts';
import type { Idea } from '../../domain/idea/entities/Idea.ts';
import type { Production, ProductionFormat } from '../../domain/production/entities/Production.ts';
import { progressCounts } from '../../domain/production/entities/Production.ts';
import type { ProductionStep } from '../../domain/production/entities/ProductionStep.ts';
import { formatDuration } from '../../domain/production/entities/TimeEntry.ts';
import { formatDate, formatNumber, toIsoDate } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';
import { usePreferences } from '../hooks/usePreferences.ts';
import { StatCard } from '../components/StatCard.tsx';
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

/** Les six chiffres de la file. Aucun ne dépend d'une période : ce sont des états. */
export const ProductionStatCard = ({ format, stat }: FormatProps & { stat: ProductionStatKey }) => {
  const { data: overview } = useProductionOverview(format);
  const stats = overview?.stats;
  const tail = suffix(format);

  switch (stat) {
    case 'inQueue':
      return (
        <StatCard
          label="En cours"
          value={stats ? String(stats.inQueue) : PENDING}
          hint={stats ? `${stats.inProgress} attaquée(s)${tail}` : undefined}
          icon={<Clapperboard className="h-4 w-4" />}
        />
      );
    case 'progress':
      return (
        <StatCard
          label="Avancement moyen"
          value={stats ? `${Math.round(stats.averageProgress * 100)} %` : PENDING}
          hint={`étapes et tâches cochées${tail}`}
          icon={<ListChecks className="h-4 w-4" />}
        />
      );
    case 'next':
      return (
        <StatCard
          label="Prochaine sortie"
          value={stats?.nextRelease ? formatDate(stats.nextRelease.date) : '—'}
          hint={stats?.nextRelease?.title ?? 'aucune date posée'}
          icon={<Rocket className="h-4 w-4" />}
        />
      );
    case 'week':
      return (
        <StatCard
          label="Temps cette semaine"
          value={stats ? formatDuration(stats.weekTrackedMinutes) : PENDING}
          hint={`${formatLoad(overview?.weekLoadMinutes ?? 0)} planifié${tail}`}
          icon={<Timer className="h-4 w-4" />}
          accent={stats && stats.weekTrackedMinutes > 0 ? 'var(--positive)' : undefined}
        />
      );
    case 'late':
      return (
        <StatCard
          label="En retard"
          value={stats ? String(stats.late) : PENDING}
          hint={stats ? `${stats.dueThisWeek} à sortir cette semaine${tail}` : undefined}
          icon={<CalendarClock className="h-4 w-4" />}
          accent={stats && stats.late > 0 ? 'var(--negative)' : undefined}
        />
      );
    case 'paused':
      return (
        <StatCard
          label="Bloquées"
          value={stats ? String(stats.paused) : PENDING}
          hint={`en attente de quelqu'un d'autre${tail}`}
          icon={<Pause className="h-4 w-4" />}
          accent={stats && stats.paused > 0 ? 'var(--expense)' : undefined}
        />
      );
  }
};

/** Toute la file, tous formats : la carte « En production » d'avant le dashboard composé. */
export const ProductionQueueCountCard = () => {
  const { data: production } = useProductionOverview();
  return (
    <StatCard
      label="En production"
      value={formatNumber(production?.queue.length ?? 0)}
      hint="vidéos et shorts pas encore publiés"
      icon={<Clapperboard className="h-4 w-4" />}
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
