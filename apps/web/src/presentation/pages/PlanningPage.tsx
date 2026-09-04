import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  Plus,
  RotateCw,
  Settings,
} from 'lucide-react';
import {
  localToday,
  nowMinutes,
  shiftDate,
  startOfWeek,
  usePlanningBoard,
  useReplan,
  useStartSlotTimer,
  useUnapproveSlot,
} from '../../application/planning/usecases/usePlanning.ts';
import {
  useDeleteSlot,
  useRunningTimer,
  useUpdateSlot,
} from '../../application/production/usecases/useProductions.ts';
import type { ProductionSlot } from '../../domain/production/entities/ProductionSlot.ts';
import { formatMinutes, toTime } from '../../domain/planning/entities/Planning.ts';
import { PlanningGrid } from '../components/planning/PlanningGrid.tsx';
import { PlanningQueue } from '../components/planning/PlanningQueue.tsx';
import { AddToPlanDialog } from '../components/planning/AddToPlanDialog.tsx';
import { ApproveSlotDialog } from '../components/planning/ApproveSlotDialog.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { cn } from '../../shared/cn.ts';

type Span = 'day' | 'week';

/**
 * Le planning : ce qu'il y a à faire aujourd'hui et cette semaine, posé dans le temps
 * qui reste entre les rendez-vous.
 *
 * Deux vues seulement, jour et semaine, et pas de vue mois : un créneau de montage se
 * décide à l'heure près, et une grille mensuelle ne montre plus les heures. Ce qui se
 * regarde au mois, c'est la sortie des vidéos — et c'est le planning de l'écran
 * Production qui le dit déjà.
 *
 * Trois gestes, et c'est tout : **approuver** un créneau (le temps passé rejoint le
 * compteur de la vidéo), le **déplacer** au doigt, ou le **supprimer** — auquel cas la
 * tâche reste dans la pile et retrouvera une place au prochain replacement.
 */
export const PlanningPage = () => {
  const today = localToday();
  const [span, setSpan] = useState<Span>('week');
  const [anchor, setAnchor] = useState<string>(today);

  const from = span === 'day' ? anchor : startOfWeek(anchor);
  const to = span === 'day' ? anchor : shiftDate(from, 6);

  const { data: board, isLoading } = usePlanningBoard(from, to);
  const replan = useReplan();
  const updateSlot = useUpdateSlot();
  const deleteSlot = useDeleteSlot();
  const unapprove = useUnapproveSlot();
  const startTimer = useStartSlotTimer();
  const { data: running } = useRunningTimer();

  const [addOpen, setAddOpen] = useState(false);
  const [approving, setApproving] = useState<ProductionSlot | null>(null);

  /**
   * Déplacer un créneau à la main.
   *
   * La durée est **conservée** : on choisit un moment, pas une durée — la redimensionner
   * se fait en corrigeant le temps réellement passé à l'approbation. Le créneau devient
   * `manual`, donc **immobile** pour le moteur : le poser à la main est une décision, et
   * le prochain replacement n'a pas à la défaire.
   */
  const move = (slot: ProductionSlot, date: string, startMinutes: number) => {
    if (!slot.startTime || !slot.endTime) return;
    const duration =
      Number(slot.endTime.slice(0, 2)) * 60 +
      Number(slot.endTime.slice(3, 5)) -
      (Number(slot.startTime.slice(0, 2)) * 60 + Number(slot.startTime.slice(3, 5)));

    updateSlot.mutate({
      id: slot.id,
      input: {
        date,
        startTime: toTime(startMinutes),
        endTime: toTime(startMinutes + duration),
        origin: 'manual',
      },
    });
  };

  const totals = (board?.days ?? []).reduce(
    (sum, day) => ({
      suggested: sum.suggested + day.suggestedMinutes,
      approved: sum.approved + day.approvedMinutes,
    }),
    { suggested: 0, approved: 0 },
  );

  const busy =
    replan.isPending ||
    updateSlot.isPending ||
    deleteSlot.isPending ||
    unapprove.isPending ||
    startTimer.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Planning</h1>
          <p className="text-sm text-muted-foreground">
            {formatMinutes(totals.suggested)} encore à faire, {formatMinutes(totals.approved)} déjà
            passées sur la période affichée.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-border">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setAnchor(shiftDate(anchor, span === 'day' ? -1 : -7))}
              title="Période précédente"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Précédent</span>
            </Button>
            <button
              type="button"
              onClick={() => setAnchor(today)}
              className="h-8 border-x border-border px-3 text-xs font-medium hover:bg-accent"
            >
              Aujourd’hui
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => setAnchor(shiftDate(anchor, span === 'day' ? 1 : 7))}
              title="Période suivante"
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Suivant</span>
            </Button>
          </div>

          <div className="flex items-center rounded-md border border-border p-0.5">
            {(['day', 'week'] as Span[]).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSpan(value)}
                className={cn(
                  'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  span === value
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {value === 'day' ? 'Jour' : 'Semaine'}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => replan.mutate({ from: today, nowMinutes: nowMinutes() })}
            title="Recaler toutes les suggestions au mieux, sans toucher aux créneaux approuvés"
          >
            <RotateCw className="h-4 w-4" />
            Repositionner
          </Button>

          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Ajouter une vidéo
          </Button>
        </div>
      </div>

      {/* Ce qui empêche le planning de fonctionner passe avant la grille : une grille
          vide sans explication se lit comme une panne. */}
      {board && !board.hasWorkHours && (
        <Card className="flex flex-wrap items-center gap-3 border-[var(--negative)]/40 p-3">
          <CalendarOff className="h-4 w-4 shrink-0 text-[var(--negative)]" />
          <p className="min-w-0 flex-1 text-sm">
            Aucun horaire de travail n’est configuré : le moteur n’a nulle part où poser un créneau.
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/parametres?onglet=planning">
              <Settings className="h-4 w-4" />
              Régler mes horaires
            </Link>
          </Button>
        </Card>
      )}

      {board?.calendarError && (
        <Card className="flex items-center gap-3 border-[var(--negative)]/40 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--negative)]" />
          <p className="min-w-0 flex-1 text-sm">
            Agenda illisible : {board.calendarError}. Les créneaux sont placés sans tenir compte de
            tes rendez-vous.
          </p>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          {isLoading && (
            <p className="p-8 text-center text-sm text-muted-foreground">Chargement…</p>
          )}
          {board && (
            <PlanningGrid
              days={board.days}
              today={today}
              busy={busy}
              onMove={move}
              runningEntryId={running?.id ?? null}
              onStartTimer={(slot) => startTimer.mutate(slot.id)}
              onApprove={setApproving}
              onUnapprove={(slot) => {
                // L'horaire ne revient pas à sa durée d'origine : l'approbation l'a
                // recalé sur le temps réellement passé, et personne n'a vécu l'autre.
                if (
                  window.confirm(
                    'Annuler l’approbation ? La session de travail enregistrée sera retirée.',
                  )
                ) {
                  unapprove.mutate(slot.id);
                }
              }}
              onDelete={(slot) => {
                // Supprimer ne retire pas la tâche de la pile : elle retrouvera une
                // place au prochain replacement, ce qui est exactement l'usage —
                // « pas maintenant », pas « jamais ».
                deleteSlot.mutate(slot.id);
              }}
              onReorganizeDay={(date) =>
                replan.mutate({ onlyDate: date, nowMinutes: date === today ? nowMinutes() : 0 })
              }
            />
          )}
        </Card>

        <div className="space-y-4">
          <PlanningQueue items={board?.items ?? []} />

          {board && !board.calendarConnected && (
            <Card className="p-4">
              <p className="text-sm font-medium">Agenda non connecté</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Le planning fonctionne sans, mais il ne connaît pas tes rendez-vous et posera des
                créneaux par-dessus.
              </p>
              <Button variant="outline" size="sm" className="mt-2.5" asChild>
                <Link to="/parametres?onglet=planning">Connecter Home Assistant</Link>
              </Button>
            </Card>
          )}
        </div>
      </div>

      <AddToPlanDialog open={addOpen} onOpenChange={setAddOpen} />
      <ApproveSlotDialog slot={approving} onOpenChange={() => setApproving(null)} />
    </div>
  );
};
