import { useCallback, useState } from 'react';
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
  shiftDate,
  usePlaceItem,
  usePlanningBoard,
  usePlanningSettings,
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
import {
  defaultSlotMinutes,
  formatMinutes,
  toTime,
  type PlanningItem,
} from '../../domain/planning/entities/Planning.ts';
import { PlanningGrid } from '../components/planning/PlanningGrid.tsx';
import { PlanningQueue } from '../components/planning/PlanningQueue.tsx';
import { AddToPlanDialog } from '../components/planning/AddToPlanDialog.tsx';
import { ApproveSlotDialog } from '../components/planning/ApproveSlotDialog.tsx';
import { SlotTimeDialog } from '../components/planning/SlotTimeDialog.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { cn } from '../../shared/cn.ts';

type Span = 'day' | 'week';

/** « 6 sept. » ou « 6 → 12 sept. » : la fenêtre affichée, en une ligne. */
const formatRange = (from: string, to: string): string => {
  const format = (date: string, withMonth: boolean) =>
    new Date(`${date}T12:00:00`).toLocaleDateString('fr-FR', {
      day: 'numeric',
      ...(withMonth ? { month: 'short' } : {}),
    });

  if (from === to) return format(from, true);
  // Le mois n'est répété que s'il change : « 30 sept. → 6 oct. » a besoin des deux,
  // « 6 → 12 sept. » se lirait mal avec.
  return `${format(from, from.slice(0, 7) !== to.slice(0, 7))} → ${format(to, true)}`;
};

/**
 * Le planning : ce qu'il y a à faire aujourd'hui et cette semaine, posé dans le temps
 * qui reste entre les rendez-vous.
 *
 * Deux vues seulement, un jour ou sept, et pas de vue mois : un créneau de montage se
 * décide à l'heure près, et une grille mensuelle ne montre plus les heures. Ce qui se
 * regarde au mois, c'est la sortie des vidéos — et c'est le planning de l'écran
 * Production qui le dit déjà.
 *
 * **La fenêtre est glissante, et on avance d'un jour à la fois.** La vue large montrait
 * auparavant la semaine ISO, et les flèches sautaient de sept jours : mercredi, on ne
 * pouvait pas regarder les sept jours qui venaient sans perdre de vue lundi et mardi.
 * Sept jours à partir du jour choisi répondent à la question qu'on pose réellement —
 * « qu'est-ce qui m'attend à partir de maintenant » —, le pas d'un jour permet d'y
 * arriver depuis n'importe où, et le sous-titre dit toujours quelle fenêtre est à
 * l'écran.
 *
 * Trois gestes, et c'est tout : **approuver** un créneau (le temps passé rejoint le
 * compteur de la vidéo), le **déplacer** au doigt, ou le **supprimer** — auquel cas la
 * tâche reste dans la pile et retrouvera une place au prochain replacement.
 */
export const PlanningPage = () => {
  const today = localToday();
  const [span, setSpan] = useState<Span>('week');
  const [anchor, setAnchor] = useState<string>(today);

  const from = anchor;
  const to = span === 'day' ? anchor : shiftDate(anchor, 6);

  const { data: board, isLoading } = usePlanningBoard(from, to);
  // Les bornes de forme d'un créneau : c'est d'elles que se déduit la durée d'un bloc
  // posé à la main. Requête partagée avec l'écran de réglages (cache 5 min).
  const { data: settings } = usePlanningSettings();
  const replan = useReplan();
  const placeItem = usePlaceItem();
  const updateSlot = useUpdateSlot();
  const deleteSlot = useDeleteSlot();
  const unapprove = useUnapproveSlot();
  const startTimer = useStartSlotTimer();
  const { data: running } = useRunningTimer();

  const [addOpen, setAddOpen] = useState(false);
  const [approving, setApproving] = useState<ProductionSlot | null>(null);
  /**
   * Créneau dont on corrige l'horaire à la main.
   *
   * C'est le seul geste possible sur un créneau **approuvé** : il ne se glisse plus (il
   * raconte du temps passé, et le glisser réécrirait le passé sans qu'on l'ait décidé),
   * mais on se trompe d'heure en le confirmant, et il faut bien pouvoir le corriger.
   */
  const [editingTime, setEditingTime] = useState<ProductionSlot | null>(null);

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

  /**
   * La tâche attrapée dans la pile « En cours », le temps du glissement.
   *
   * Elle vit **ici** et non dans l'un des deux composants : la pile sait ce qu'on a
   * attrapé, la grille sait où on le lâche, et aucune des deux ne peut répondre seule.
   */
  const [pending, setPending] = useState<PlanningItem | null>(null);

  /**
   * La durée du créneau qui sera posé, calculée **avant** le lâcher.
   *
   * Le fantôme qui suit le curseur doit faire exactement la taille du bloc qui va naître,
   * sinon il saute de hauteur au relâchement. La règle est dupliquée côté API, qui
   * l'applique quand `minutes` n'est pas fourni.
   */
  const pendingMinutes =
    pending && settings ? defaultSlotMinutes(pending, settings) : (settings?.minBlockMinutes ?? 60);

  // Mémorisés : la grille les prend en dépendance de l'écouteur global qu'elle installe
  // pendant le glissement, et deux fonctions neuves à chaque rendu le feraient
  // réattacher à chaque mouvement de souris.
  const place = placeItem.mutate;
  const dropPending = useCallback(
    (date: string, startMinutes: number) => {
      if (!pending) return;
      place({
        itemId: pending.id,
        date,
        startTime: toTime(startMinutes),
        // La durée voyage avec la demande : l'API la recalculerait à l'identique, mais
        // entre le début du geste et le lâcher, un autre créneau a pu changer le reste à
        // couvrir — et le bloc posé ne ferait alors plus la taille du fantôme.
        minutes: pendingMinutes,
      });
      setPending(null);
    },
    [pending, pendingMinutes, place],
  );

  const cancelPending = useCallback(() => setPending(null), []);

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
    startTimer.isPending ||
    placeItem.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Planning</h1>
          {/* La fenêtre est glissante : sans elle écrite noir sur blanc, « Semaine » ne
              dirait plus laquelle, et deux clics de flèche perdraient le lecteur. */}
          <p className="text-sm text-muted-foreground">
            {formatRange(from, to)} · {formatMinutes(totals.suggested)} encore à faire,{' '}
            {formatMinutes(totals.approved)} déjà passées.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-md border border-border">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setAnchor(shiftDate(anchor, -1))}
              title="Reculer d’un jour"
            >
              <ChevronLeft className="h-4 w-4" />
              <span className="sr-only">Jour précédent</span>
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
              onClick={() => setAnchor(shiftDate(anchor, 1))}
              title="Avancer d’un jour"
            >
              <ChevronRight className="h-4 w-4" />
              <span className="sr-only">Jour suivant</span>
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
                {value === 'day' ? 'Jour' : '7 jours'}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => replan.mutate({ from: today })}
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
              productions={board.productions}
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
              // `planningNow` part avec chaque replan : le plancher se pose sur le jour
              // qui est réellement aujourd'hui, pas sur le premier jour de l'horizon.
              onReorganizeDay={(date) => replan.mutate({ onlyDate: date })}
              onEditTime={setEditingTime}
              // Seule la fin bouge, et le créneau passe en `manual` : on vient de
              // décider de la durée, le prochain replacement n'a pas à la défaire.
              onResize={(slot, endMinutes) =>
                updateSlot.mutate({
                  id: slot.id,
                  input: { endTime: toTime(endMinutes), origin: 'manual' },
                })
              }
              pendingItem={pending}
              pendingMinutes={pendingMinutes}
              onExternalDrop={dropPending}
              onExternalCancel={cancelPending}
            />
          )}
        </Card>

        <div className="space-y-4">
          <PlanningQueue
            items={board?.items ?? []}
            onPickUp={setPending}
            pendingId={pending?.id ?? null}
          />

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
      <SlotTimeDialog slot={editingTime} onOpenChange={() => setEditingTime(null)} />
    </div>
  );
};
