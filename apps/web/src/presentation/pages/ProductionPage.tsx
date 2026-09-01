import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Clock, ExternalLink, Plus } from 'lucide-react';
import {
  useProductionOverview,
  useProductions,
  useProductionSlots,
  useProductionSteps,
  useReorderProductions,
  useToggleStep,
} from '../../application/production/usecases/useProductions.ts';
import { useDeleteIdea } from '../../application/idea/usecases/useIdeas.ts';
import type { Idea } from '../../domain/idea/entities/Idea.ts';
import { formatDate } from '../../shared/format.ts';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { AlertsBanner } from '../components/production/AlertsBanner.tsx';
import { ProductionCard } from '../components/production/ProductionCard.tsx';
import { ProductionGantt } from '../components/production/ProductionGantt.tsx';
import { IdeaBox } from '../components/production/IdeaBox.tsx';
import { SlotSummary } from '../components/production/SlotSummary.tsx';
import { ProductionDialog } from '../components/forms/ProductionDialog.tsx';

/** « 4 h 30 » — la charge d'une semaine se lit en heures, pas en minutes. */
const formatLoad = (minutes: number): string => {
  if (minutes === 0) return 'aucun horaire posé';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
};

export const ProductionPage = () => {
  const { data: overview, isLoading } = useProductionOverview();
  const { data: steps = [] } = useProductionSteps();
  const { data: done = [] } = useProductions({ statuses: ['done'] });
  const { data: slots = [] } = useProductionSlots();

  const reorder = useReorderProductions();
  const toggleStep = useToggleStep();
  const deleteIdea = useDeleteIdea();
  const [dialogOpen, setDialogOpen] = useState(false);
  /** Idée en cours de promotion : son texte remplit le titre, et elle part à la création. */
  const [promoted, setPromoted] = useState<Idea | null>(null);

  const queue = overview?.queue ?? [];

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
            {queue.length} vidéo(s) en cours · {formatLoad(overview?.weekLoadMinutes ?? 0)} planifié
            cette semaine
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nouvelle vidéo
        </Button>
      </div>

      {overview && <AlertsBanner alerts={overview.alerts} />}

      {/* Le planning se lit à l'arrivée, pas derrière un onglet : c'est la vue qui
          répond à « qu'est-ce qui sort quand », la première question de la page. Il se
          replie à cinq lignes pour ne pas repousser la file d'attente sous le pli. */}
      <ProductionGantt productions={[...queue, ...done]} slots={slots} />

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">File d'attente</TabsTrigger>
          <TabsTrigger value="done">Terminées ({done.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-2.5">
              {queue.map((production, index) => (
                <ProductionCard
                  key={production.id}
                  production={production}
                  steps={steps}
                  highlighted={production.id === overview?.nextId}
                  onToggleStep={(stepId, checked) =>
                    toggleStep.mutate({ id: production.id, stepId, checked })
                  }
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
                        className="flex items-start gap-2 rounded-md p-1.5 text-sm transition-colors hover:bg-muted/60"
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
