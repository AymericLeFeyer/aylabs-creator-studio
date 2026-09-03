import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarClock,
  Clapperboard,
  Clock,
  ExternalLink,
  ListChecks,
  Pause,
  Plus,
  Rocket,
  Rows2,
  Rows3,
  Timer,
} from 'lucide-react';
import {
  useProductionOverview,
  useProductions,
  useProductionSlots,
  useProductionSteps,
  useReorderProductions,
} from '../../application/production/usecases/useProductions.ts';
import { useDeleteIdea } from '../../application/idea/usecases/useIdeas.ts';
import type { Idea } from '../../domain/idea/entities/Idea.ts';
import type { Production } from '../../domain/production/entities/Production.ts';
import { progressCounts } from '../../domain/production/entities/Production.ts';
import type { ProductionStep } from '../../domain/production/entities/ProductionStep.ts';
import { formatDuration } from '../../domain/production/entities/TimeEntry.ts';
import { usePreferences } from '../hooks/usePreferences.ts';
import { formatDate, toIsoDate } from '../../shared/format.ts';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { AlertsBanner } from '../components/production/AlertsBanner.tsx';
import { ProductionCard } from '../components/production/ProductionCard.tsx';
import { ProductionGantt } from '../components/production/ProductionGantt.tsx';
import { IdeaBox } from '../components/production/IdeaBox.tsx';
import { StepTodosDialog } from '../components/production/StepTodosDialog.tsx';
import { StartTimerDialog } from '../components/production/StartTimerDialog.tsx';
import { cn } from '../../shared/cn.ts';
import { SlotSummary } from '../components/production/SlotSummary.tsx';
import { ProductionDialog } from '../components/forms/ProductionDialog.tsx';

/** « 4 h 30 » — la charge d'une semaine se lit en heures, pas en minutes. */
const formatLoad = (minutes: number): string =>
  minutes === 0 ? 'aucun horaire posé' : formatDuration(minutes);

export const ProductionPage = () => {
  const { data: overview, isLoading } = useProductionOverview();
  const { data: steps = [] } = useProductionSteps();
  const { data: done = [] } = useProductions({ statuses: ['done'] });
  const { data: slots = [] } = useProductionSlots();

  const reorder = useReorderProductions();
  const deleteIdea = useDeleteIdea();
  const { preferences, set } = usePreferences();

  const [dialogOpen, setDialogOpen] = useState(false);
  /** Idée en cours de promotion : son texte remplit le titre, et elle part à la création. */
  const [promoted, setPromoted] = useState<Idea | null>(null);
  /** L'étape dont on regarde les tâches, avec sa vidéo. */
  const [openStep, setOpenStep] = useState<{ production: Production; step: ProductionStep } | null>(
    null,
  );
  const [timerFor, setTimerFor] = useState<Production | null>(null);
  /**
   * Les cartes dépliées à contre-courant du réglage global : on veut souvent une file
   * compacte *sauf* la vidéo sur laquelle on travaille.
   */
  const [exceptions, setExceptions] = useState<Set<string>>(new Set());

  const queue = overview?.queue ?? [];
  const stats = overview?.stats;
  const today = toIsoDate(new Date());

  const toggleException = (id: string) =>
    setExceptions((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * Une vidéo **pas encore commencée** est repliée d'office.
   *
   * Une carte détaillée sert à décider *quoi faire ensuite* : étapes cochées, créneau
   * posé, argent engagé. À 0 %, elle n'a rien de tout ça à montrer — elle occupe une
   * hauteur de bloc pour dire « rien n'a commencé ». Les idées notées en vrac
   * s'accumulent au bas de la file, et c'est ce qui la rendait longue à parcourir.
   *
   * Ce n'est qu'un **défaut** : le chevron rouvre la carte, et le réglage global
   * l'emporte dès qu'on le change.
   */
  const startedOn = (production: Production): boolean =>
    progressCounts(production, steps.length).done > 0;

  const isCompact = (production: Production) => {
    const byDefault = preferences.compactQueue || !startedOn(production);
    return exceptions.has(production.id) ? !byDefault : byDefault;
  };

  const openCreate = () => {
    setPromoted(null);
    setDialogOpen(true);
  };

  /** Une idée devient une vidéo : son texte remplit le titre, elle-même part à la création. */
  const promote = (idea: Idea) => {
    setPromoted(idea);
    setDialogOpen(true);
  };

  /** Déplace une carte d'un cran et réécrit l'ordre complet de la file. */
  const move = (index: number, direction: -1 | 1) => {
    const next = [...queue];
    const target = index + direction;
    const current = next[index];
    const other = next[target];
    if (!current || !other) return;
    next[index] = other;
    next[target] = current;
    reorder.mutate(next.map((production) => production.id));
  };

  if (!isLoading && queue.length === 0 && done.length === 0) {
    return (
      <>
        <EmptyState
          title="Aucune vidéo en production"
          description="Crée ta première vidéo : elle portera son script, ses créneaux, ses produits et ses sponsos, puis se rattachera à sa sortie le jour de la publication."
          actionLabel="Nouvelle vidéo"
          onAction={openCreate}
        />
        <ProductionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Production</h1>
          <p className="text-sm text-muted-foreground">
            Ce qui est en cours, ce qui sort quand, et le temps que ça prend vraiment.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nouvelle vidéo
        </Button>
      </div>

      {/* Les chiffres de la file. Aucun ne dépend d'une période — ce sont des états, et
          c'est pour ça que cet écran n'a pas de barre de filtres. La seule fenêtre qui
          ait un sens ici est la semaine : ce sur quoi on peut encore agir. */}
      {stats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            label="En cours"
            value={String(stats.inQueue)}
            hint={`${stats.inProgress} attaquée(s)`}
            icon={<Clapperboard className="h-4 w-4" />}
          />
          <StatCard
            label="Avancement moyen"
            value={`${Math.round(stats.averageProgress * 100)} %`}
            hint="étapes et tâches cochées"
            icon={<ListChecks className="h-4 w-4" />}
          />
          <StatCard
            label="Prochaine sortie"
            value={stats.nextRelease ? formatDate(stats.nextRelease.date) : '—'}
            hint={stats.nextRelease?.title ?? 'aucune date posée'}
            icon={<Rocket className="h-4 w-4" />}
          />
          <StatCard
            label="Temps cette semaine"
            value={formatDuration(stats.weekTrackedMinutes)}
            hint={`${formatLoad(overview?.weekLoadMinutes ?? 0)} planifié`}
            icon={<Timer className="h-4 w-4" />}
            accent={stats.weekTrackedMinutes > 0 ? 'var(--positive)' : undefined}
          />
          <StatCard
            label="En retard"
            value={String(stats.late)}
            hint={`${stats.dueThisWeek} à sortir cette semaine`}
            icon={<CalendarClock className="h-4 w-4" />}
            accent={stats.late > 0 ? 'var(--negative)' : undefined}
          />
          <StatCard
            label="Bloquées"
            value={String(stats.paused)}
            hint="en attente de quelqu'un d'autre"
            icon={<Pause className="h-4 w-4" />}
            accent={stats.paused > 0 ? 'var(--expense)' : undefined}
          />
        </div>
      )}

      {overview && <AlertsBanner alerts={overview.alerts} />}

      {/* Le planning se lit à l'arrivée, pas derrière un onglet : c'est la vue qui
          répond à « qu'est-ce qui sort quand », la première question de la page. */}
      <ProductionGantt productions={[...queue, ...done]} slots={slots} steps={steps} />

      <Tabs defaultValue="queue">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="queue">File d'attente</TabsTrigger>
            <TabsTrigger value="done">Terminées ({done.length})</TabsTrigger>
          </TabsList>

          {/* Le repli est une préférence, pas un état d'écran : au-delà de cinq vidéos
              en cours, la version détaillée oblige à faire défiler pour voir sa file. */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              set({ compactQueue: !preferences.compactQueue });
              setExceptions(new Set());
            }}
          >
            {preferences.compactQueue ? (
              <Rows3 className="h-4 w-4" />
            ) : (
              <Rows2 className="h-4 w-4" />
            )}
            {preferences.compactQueue ? 'Vue détaillée' : 'Vue compacte'}
          </Button>
        </div>

        <TabsContent value="queue">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-2.5">
              {queue.map((production, index) => (
                <ProductionCard
                  key={production.id}
                  production={production}
                  steps={steps}
                  highlighted={production.id === overview?.nextId}
                  timerRunning={overview?.running?.productionId === production.id}
                  compact={isCompact(production)}
                  onToggleCompact={() => toggleException(production.id)}
                  onOpenStep={(step) => setOpenStep({ production, step })}
                  onStartTimer={() => setTimerFor(production)}
                  onMoveUp={index > 0 ? () => move(index, -1) : undefined}
                  onMoveDown={index < queue.length - 1 ? () => move(index, 1) : undefined}
                />
              ))}
              {queue.length === 0 && (
                <Card className="p-8 text-center text-sm text-muted-foreground">
                  Rien en cours. Tout est publié.
                </Card>
              )}
            </div>

            <div className="space-y-4">
              {/* Les créneaux à venir, tous projets confondus : ce que dit l'agenda. */}
              <Card className="h-fit">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <CalendarClock className="h-4 w-4" />
                    Prochains créneaux
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {(overview?.upcomingSlots ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Aucun créneau posé sur les 14 prochains jours.
                    </p>
                  ) : (
                    (overview?.upcomingSlots ?? []).map((slot) => (
                      <Link
                        key={slot.id}
                        to={`/production/${slot.productionId}`}
                        // Le créneau du jour se détache de la pile : c'est le seul de la
                        // liste sur lequel on peut encore agir maintenant.
                        className={cn(
                          'flex items-start gap-2 rounded-md p-1.5 text-sm transition-colors',
                          slot.date === today
                            ? 'border-l-2 border-[var(--negative)] bg-accent/60 pl-2 hover:bg-accent'
                            : 'hover:bg-muted/60',
                        )}
                      >
                        <span
                          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor: slot.channelColor ?? 'var(--muted-foreground)',
                          }}
                          aria-hidden
                        />
                        <SlotSummary slot={slot} showProduction />
                      </Link>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Le carnet vit à côté de la file, pas dans un écran à part : une idée se
                  note pendant qu'on regarde ce qu'on est en train de faire. */}
              <IdeaBox onPromote={promote} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="done">
          {done.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              Aucune vidéo publiée depuis l'outil pour l'instant.
            </Card>
          ) : (
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
                    <Link
                      to={`/production/${production.id}`}
                      className="block font-medium hover:underline"
                    >
                      <span className="line-clamp-2">
                        {production.videoTitle ?? production.title}
                      </span>
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
          )}
        </TabsContent>
      </Tabs>

      {openStep && (
        <StepTodosDialog
          open
          onOpenChange={(value) => !value && setOpenStep(null)}
          // La liste vient de l'aperçu rechargé, pas de l'instantané capturé au clic :
          // cocher une tâche doit se voir dans la modale restée ouverte.
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
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultTitle={promoted?.text}
        // L'idée n'est retirée qu'une fois la vidéo réellement créée : abandonner le
        // formulaire ne doit pas la faire disparaître.
        onCreated={() => {
          if (promoted) deleteIdea.mutate(promoted.id);
          setPromoted(null);
        }}
      />
    </div>
  );
};
