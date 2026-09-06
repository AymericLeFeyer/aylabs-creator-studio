import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Clock, ExternalLink, Play, Timer, Trash2, Undo2, Video, Wand2 } from 'lucide-react';
import type { ProductionSlot } from '../../../domain/production/entities/ProductionSlot.ts';
import {
  dayBounds,
  formatMinutes,
  toMinutes,
  toTime,
  WEEKDAY_SHORT,
  type PlanningDay,
  type PlanningItem,
  type PlanningProductionSpan,
} from '../../../domain/planning/entities/Planning.ts';
import { STATUS_LABELS } from '../../../domain/production/entities/Production.ts';
import { Button } from '../ui/button.tsx';
import { cn } from '../../../shared/cn.ts';
import { readableTextColor } from '../../../shared/contrast.ts';

/** Hauteur d'une heure de grille, en pixels. */
const HOUR_HEIGHT = 56;

/** Pas de déplacement au drag : on ne cale pas un créneau à la minute près. */
const DRAG_STEP = 15;

/** Hauteur d'une bande de la swimlane des vidéos, en pixels. */
const LANE_HEIGHT = 22;

export interface PlanningGridProps {
  days: PlanningDay[];
  /**
   * Les fenêtres de travail des vidéos, dessinées en swimlane au-dessus des heures.
   * Elles disent sur quoi on est censé travailler ces jours-ci, ce qu'une colonne de
   * créneaux ne dit pas : une vidéo peut avoir une période sans qu'aucune heure ne soit
   * encore posée.
   */
  productions?: PlanningProductionSpan[];
  today: string;
  onMove: (slot: ProductionSlot, date: string, startMinutes: number) => void;
  onApprove: (slot: ProductionSlot) => void;
  /** Défaire une approbation : la session de travail part, le créneau redevient mobile. */
  onUnapprove: (slot: ProductionSlot) => void;
  onDelete: (slot: ProductionSlot) => void;
  /** Démarrer le chronomètre sur ce créneau : il sera recalé sur le temps réel à l'arrêt. */
  onStartTimer: (slot: ProductionSlot) => void;
  /**
   * Corriger l'horaire au clavier. C'est le seul geste d'horaire qui reste sur un créneau
   * **approuvé** : il ne se glisse plus, et on se trompe pourtant d'heure en confirmant.
   */
  onEditTime: (slot: ProductionSlot) => void;
  onReorganizeDay: (date: string) => void;
  /**
   * Redimensionner un créneau en tirant son bord bas. Seule la **fin** bouge : on
   * rallonge une séance, on ne la déplace pas — c'est le glissement du bloc qui fait ça.
   */
  onResize: (slot: ProductionSlot, endMinutes: number) => void;
  /**
   * La tâche que l'on est en train de faire glisser depuis la pile « En cours ».
   *
   * La grille est la seule à connaître sa propre géométrie : c'est donc elle qui suit le
   * pointeur, dessine le bloc fantôme et résout le jour et l'heure visés. La pile, elle,
   * ne fait que dire ce qu'on a attrapé.
   */
  pendingItem?: PlanningItem | null;
  /** Durée du créneau qui sera posé — celle du fantôme, pour qu'il ne saute pas. */
  pendingMinutes?: number;
  /** Le pointeur a été relâché sur la grille : on pose le créneau. */
  onExternalDrop?: (date: string, startMinutes: number) => void;
  /** Relâché en dehors : rien n'est posé, le geste s'arrête là. */
  onExternalCancel?: () => void;
  /** Session en cours, s'il y en a une : le créneau d'où elle part se signale. */
  runningEntryId?: string | null;
  /** `true` pendant qu'une écriture tourne : la grille se grise sans se démonter. */
  busy?: boolean;
}

interface DragState {
  slotId: string;
  /** Écart entre le haut du bloc et le point saisi, pour ne pas le faire sauter. */
  grabOffset: number;
  /** Colonne d'où le bloc est parti : le décalage visuel s'en déduit. */
  originIndex: number;
  /** Colonne survolée. Change en cours de geste — c'est le déplacement entre jours. */
  targetIndex: number;
  /** Largeur d'une colonne, mesurée au démarrage : elle ne bouge pas pendant le geste. */
  columnWidth: number;
  startMinutes: number;
  durationMinutes: number;
}

/**
 * Le redimensionnement en cours. Le début ne bouge pas : c'est la fin qui suit le
 * pointeur, exactement comme on rallonge une séance de montage qui déborde.
 */
interface ResizeState {
  slotId: string;
  startMinutes: number;
  endMinutes: number;
}

/** La cible visée par une tâche glissée depuis la pile. */
interface GhostState {
  dayIndex: number;
  startMinutes: number;
}

/** L'heure locale courante, en minutes depuis minuit. */
const currentMinutes = (): number => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

/**
 * La grille du planning : une colonne par jour, les heures en ordonnée.
 *
 * Écrite à la main, sans bibliothèque de calendrier ni de drag & drop. Le besoin tient
 * en une conversion « pixels ↔ minutes » et trois écouteurs de pointeur, là où une
 * dépendance imposerait son modèle d'événement, son thème et sa gestion du fuseau — le
 * même parti pris que le Gantt et les confettis.
 *
 * **Le bloc en cours de déplacement n'est jamais démonté.** Il reste dans la colonne
 * d'où il est parti et se décale par un `translateX` d'un nombre entier de colonnes.
 * Le rendre dans la colonne survolée le retirerait du DOM le temps d'un rendu, et la
 * capture du pointeur partirait avec lui : le geste s'interromprait au moment précis où
 * l'on franchit la frontière entre deux jours — c'est-à-dire dès qu'on essaie de
 * déplacer un créneau d'un jour à l'autre.
 *
 * **L'heure visée est annoncée pendant tout le geste**, à trois endroits : sur le bloc,
 * dans la gouttière des heures, et par un trait en pointillés à la hauteur du début. Sans
 * elle on déplace à l'aveugle — la grille n'a un repère qu'à l'heure pleine, et rien ne
 * dit sur quel quart d'heure le bloc va retomber.
 *
 * Les événements de l'agenda sont dessinés **en fond, en lecture seule** : ils occupent
 * la place, on ne les déplace pas depuis ici. Un créneau **approuvé** ne se déplace pas
 * non plus — il raconte du temps déjà passé, le bouger réécrirait le passé.
 */
export const PlanningGrid = ({
  days,
  productions = [],
  today,
  onMove,
  onApprove,
  onUnapprove,
  onDelete,
  onStartTimer,
  onEditTime,
  onReorganizeDay,
  onResize,
  pendingItem = null,
  pendingMinutes = 60,
  onExternalDrop,
  onExternalCancel,
  runningEntryId = null,
  busy = false,
}: PlanningGridProps) => {
  const bounds = dayBounds(days);
  const totalMinutes = bounds.end - bounds.start;
  const height = (totalMinutes / 60) * HOUR_HEIGHT;
  const columnsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [resize, setResize] = useState<ResizeState | null>(null);
  const [ghost, setGhost] = useState<GhostState | null>(null);
  /**
   * La même cible, lisible depuis le gestionnaire de relâchement.
   *
   * Les écouteurs sont posés sur `window` — le pointeur est parti d'un autre composant,
   * il n'y a rien à capturer ici —, et leur closure figerait l'état au moment de
   * l'attache. La ref est la seule valeur qui soit à jour au moment du lâcher.
   */
  const ghostRef = useRef<GhostState | null>(null);

  // L'heure courante, rafraîchie à la minute : c'est la maille du trait, l'animer à la
  // seconde ferait un rendu par seconde pour un déplacement d'un pixel toutes les minutes.
  const [nowMinutes, setNowMinutes] = useState(currentMinutes);
  useEffect(() => {
    const id = window.setInterval(() => setNowMinutes(currentMinutes()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const yOf = (minutes: number) => ((minutes - bounds.start) / 60) * HOUR_HEIGHT;
  const minutesOf = (y: number) => bounds.start + (y / HOUR_HEIGHT) * 60;

  /** Les traits horaires, une ligne par heure pleine. */
  const hourMarks: number[] = [];
  for (let m = Math.ceil(bounds.start / 60) * 60; m <= bounds.end; m += 60) hourMarks.push(m);

  const todayIndex = days.findIndex((day) => day.date === today);
  const showNow = todayIndex >= 0 && nowMinutes >= bounds.start && nowMinutes <= bounds.end;

  /**
   * Les fenêtres de vidéo, empilées en bandes.
   *
   * Une bande par vidéo serait la solution évidente, et la mauvaise : à six vidéos en
   * cours, la swimlane repousserait la grille horaire sous le pli alors que la plupart
   * des fenêtres ne se chevauchent pas. Le placement glouton — première bande dont la
   * dernière fenêtre s'est terminée avant celle-ci — les regroupe donc sur le moins de
   * lignes possible. Il n'est correct que parce que l'API trie par date de début.
   *
   * Les bornes sont **écrêtées à la période affichée**, et ce qui dépasse se signale par
   * un bord droit : une barre qui s'arrête net au bord du cadre se lirait comme une
   * échéance, alors que la vidéo continue la semaine suivante.
   */
  const firstDate = days[0]?.date ?? '';
  const lastDate = days[days.length - 1]?.date ?? '';
  const laneEnds: number[] = [];
  const lanes = productions.map((span) => {
    const foundStart = days.findIndex((day) => day.date === span.from);
    const foundEnd = days.findIndex((day) => day.date === span.to);
    const startIndex = foundStart === -1 ? 0 : foundStart;
    const endIndex = foundEnd === -1 ? days.length - 1 : foundEnd;

    let lane = laneEnds.findIndex((end) => end < startIndex);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(endIndex);
    } else {
      laneEnds[lane] = endIndex;
    }

    return {
      span,
      lane,
      startIndex,
      endIndex,
      clippedStart: span.from < firstDate,
      clippedEnd: span.to > lastDate,
    };
  });

  /**
   * Le déplacement.
   *
   * Le pointeur est **capturé** sur le bloc : sortir de sa colonne pendant le geste ne
   * doit pas l'interrompre, c'est précisément ce qu'on fait quand on change de jour. La
   * colonne cible se déduit de l'abscisse, la nouvelle heure de l'ordonnée, arrondie au
   * quart d'heure.
   */
  const startDrag = (event: React.PointerEvent, slot: ProductionSlot, duration: number) => {
    if (slot.done) return;
    const container = columnsRef.current?.getBoundingClientRect();
    if (!container) return;

    const block = event.currentTarget as HTMLElement;
    block.setPointerCapture(event.pointerId);
    const rect = block.getBoundingClientRect();
    const index = days.findIndex((day) => day.date === slot.date);

    setDrag({
      slotId: slot.id,
      grabOffset: event.clientY - rect.top,
      originIndex: index,
      targetIndex: index,
      columnWidth: container.width / Math.max(1, days.length),
      startMinutes: toMinutes(slot.startTime ?? '00:00'),
      durationMinutes: duration,
    });
  };

  const moveDrag = (event: React.PointerEvent) => {
    if (!drag || !columnsRef.current) return;
    const container = columnsRef.current.getBoundingClientRect();

    const targetIndex = Math.min(
      days.length - 1,
      Math.max(0, Math.floor((event.clientX - container.left) / drag.columnWidth)),
    );

    const rawStart = minutesOf(event.clientY - container.top - drag.grabOffset);
    const snapped = Math.round(rawStart / DRAG_STEP) * DRAG_STEP;
    // Borné à la grille visible et non à la journée entière : sortir du cadre par un
    // geste imprécis poserait un créneau à 3 h du matin, et l'étiquette d'heure
    // s'afficherait hors du tableau.
    const startMinutes = Math.max(
      bounds.start,
      Math.min(bounds.end - drag.durationMinutes, snapped),
    );

    if (targetIndex === drag.targetIndex && startMinutes === drag.startMinutes) return;
    setDrag({ ...drag, targetIndex, startMinutes });
  };

  const endDrag = (slot: ProductionSlot) => {
    if (!drag) return;
    const date = days[drag.targetIndex]?.date ?? slot.date;
    const moved = date !== slot.date || drag.startMinutes !== toMinutes(slot.startTime ?? '');
    if (moved) onMove(slot, date, drag.startMinutes);
    setDrag(null);
  };

  /**
   * Le redimensionnement, par le bord bas du bloc.
   *
   * `stopPropagation` est **indispensable** : sans lui, le même geste démarrerait aussi
   * le déplacement du bloc, et on tirerait le créneau vers le bas au lieu de l'allonger.
   * Le pointeur est capturé sur la poignée, qui ne fait que quelques pixels de haut — le
   * geste doit survivre à la sortie de cette bande.
   */
  const startResize = (event: React.PointerEvent, slot: ProductionSlot) => {
    if (slot.done || !slot.startTime || !slot.endTime) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    setResize({
      slotId: slot.id,
      startMinutes: toMinutes(slot.startTime),
      endMinutes: toMinutes(slot.endTime),
    });
  };

  const moveResize = (event: React.PointerEvent) => {
    if (!resize || !columnsRef.current) return;
    const container = columnsRef.current.getBoundingClientRect();
    const raw = minutesOf(event.clientY - container.top);
    const snapped = Math.round(raw / DRAG_STEP) * DRAG_STEP;
    // Un créneau ne peut pas être plus court qu'un pas ni déborder de la grille : à zéro
    // minute il ne se dessinerait plus, et on ne pourrait plus le rattraper au doigt.
    const endMinutes = Math.min(bounds.end, Math.max(resize.startMinutes + DRAG_STEP, snapped));
    if (endMinutes === resize.endMinutes) return;
    setResize({ ...resize, endMinutes });
  };

  const endResize = (slot: ProductionSlot) => {
    if (!resize) return;
    if (resize.endMinutes !== toMinutes(slot.endTime ?? '')) onResize(slot, resize.endMinutes);
    setResize(null);
  };

  /**
   * Le dépôt d'une tâche venue de la pile.
   *
   * Les écouteurs sont sur `window` et non sur la grille : le geste a commencé dans un
   * autre composant, il n'y a donc aucun pointeur à capturer ici, et suivre le curseur
   * seulement au-dessus de la grille ferait perdre le fil dès qu'on la survole de biais.
   *
   * Hors du cadre, la cible passe à `null` et le fantôme disparaît : lâcher à côté ne doit
   * rien poser, et c'est plus clair que de rabattre le bloc sur le bord le plus proche.
   */
  useEffect(() => {
    if (!pendingItem) return;

    const resolve = (clientX: number, clientY: number): GhostState | null => {
      const container = columnsRef.current?.getBoundingClientRect();
      if (!container) return null;
      if (
        clientX < container.left ||
        clientX > container.right ||
        clientY < container.top ||
        clientY > container.bottom
      ) {
        return null;
      }

      const columnWidth = container.width / Math.max(1, days.length);
      const dayIndex = Math.min(
        days.length - 1,
        Math.max(0, Math.floor((clientX - container.left) / columnWidth)),
      );
      const raw = bounds.start + ((clientY - container.top) / HOUR_HEIGHT) * 60;
      const snapped = Math.round(raw / DRAG_STEP) * DRAG_STEP;
      return {
        dayIndex,
        startMinutes: Math.max(bounds.start, Math.min(bounds.end - pendingMinutes, snapped)),
      };
    };

    const onPointerMove = (event: PointerEvent) => {
      const next = resolve(event.clientX, event.clientY);
      ghostRef.current = next;
      setGhost(next);
    };

    const onPointerUp = (event: PointerEvent) => {
      const target = resolve(event.clientX, event.clientY) ?? ghostRef.current;
      const date = target ? days[target.dayIndex]?.date : undefined;
      if (target && date) onExternalDrop?.(date, target.startMinutes);
      else onExternalCancel?.();
      ghostRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };
  }, [
    pendingItem,
    days,
    bounds.start,
    bounds.end,
    pendingMinutes,
    onExternalDrop,
    onExternalCancel,
  ]);

  /**
   * Le fantôme n'est lu que tant qu'une tâche est en main.
   *
   * L'état n'est pas remis à `null` à la fin du geste — le faire depuis l'effet
   * reviendrait à écrire un état pendant un effet, ce que la règle `set-state-in-effect`
   * du projet refuse. Le lire à travers `pendingItem` revient au même et ne coûte rien.
   */
  const activeGhost = pendingItem ? ghost : null;

  return (
    /**
     * La grille défile **dans sa carte** et non avec la page.
     *
     * C'est ce qui permet à l'en-tête des jours de rester collé : un `sticky` n'accroche
     * qu'à un conteneur qui défile réellement, et tant que la grille débordait dans le
     * flux de la page, la ligne des dates partait vers le haut dès qu'on descendait
     * chercher une fin d'après-midi — on ne savait alors plus sous quel jour on regardait.
     * La gouttière des heures est collée à gauche pour la même raison, sur sept colonnes
     * qui défilent horizontalement.
     */
    <div
      className={cn(
        'max-h-[calc(100vh-13rem)] min-h-[20rem] overflow-auto',
        busy && 'pointer-events-none opacity-60',
      )}
    >
      <div className="min-w-[720px]">
        {/* Tout ce qui étiquette les colonnes tient dans un seul bloc collant : les
            empiler séparément demanderait un `top` par bande, recalculé à chaque fois
            qu'une swimlane apparaît ou disparaît. */}
        <div className="sticky top-0 z-40 bg-card">
          {/* En-têtes : le jour, sa charge, et son bouton de réorganisation. */}
          <div className="flex border-b border-border">
            <div className="sticky left-0 z-10 w-14 shrink-0 bg-card" />
            {days.map((day, index) => {
              const isToday = day.date === today;
              const isTarget = drag !== null && drag.targetIndex === index;
              return (
                <div
                  key={day.date}
                  className={cn(
                    'flex-1 border-l border-border px-2 py-1.5 transition-colors',
                    isToday && 'bg-[var(--today)]/10',
                    isTarget && 'bg-[var(--today)]/20',
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <p
                        className={cn(
                          'truncate text-xs font-medium',
                          isToday ? 'text-[var(--today)]' : 'text-foreground',
                        )}
                      >
                        {WEEKDAY_SHORT[day.weekday]} {day.date.slice(8, 10)}/{day.date.slice(5, 7)}
                      </p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {day.suggestedMinutes + day.approvedMinutes === 0
                          ? '—'
                          : formatMinutes(day.suggestedMinutes + day.approvedMinutes)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      title="Réorganiser cette journée"
                      onClick={() => onReorganizeDay(day.date)}
                    >
                      <Wand2 className="h-3 w-3" />
                      <span className="sr-only">Réorganiser le {day.date}</span>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* La swimlane des vidéos : de quand à quand chacune occupe le calendrier.
            Elle est **au-dessus des heures** parce qu'elle se lit en premier — « sur quoi
            suis-je censé travailler ces jours-ci » vient avant « à quelle heure ». Elle ne
            se déduit pas des créneaux : une vidéo peut avoir une période annoncée sans
            qu'aucune heure n'ait encore été posée, et c'est précisément le cas qu'on veut
            voir. Purement indicative, elle ne se déplace pas depuis ici : la fenêtre d'une
            vidéo se règle sur sa fiche. */}
          {lanes.length > 0 && (
            <div className="flex border-b border-border bg-muted/20">
              {/* Une caméra plutôt que le mot « vidéos » : à quatorze pixels de large, le
                libellé se tronquait et l'icône se lit d'un coup d'œil. Centrée dans les
                deux sens, elle reste à hauteur des bandes quel qu'en soit le nombre. */}
              <div
                className="sticky left-0 z-10 flex w-14 shrink-0 items-center justify-center bg-card text-muted-foreground"
                title="Fenêtres de travail des vidéos"
              >
                <Video className="h-4 w-4" aria-hidden />
                <span className="sr-only">Vidéos</span>
              </div>
              <div
                className="relative flex-1"
                style={{ height: laneEnds.length * LANE_HEIGHT + 4 }}
              >
                {/* Les séparateurs de colonne, pour que l'œil retombe sur le bon jour. */}
                {days.map((day, index) => (
                  <div
                    key={day.date}
                    className={cn(
                      'pointer-events-none absolute inset-y-0 border-l border-border',
                      day.date === today && 'bg-[var(--today)]/10',
                    )}
                    style={{
                      left: `${(index * 100) / days.length}%`,
                      width: `${100 / days.length}%`,
                    }}
                  />
                ))}

                {lanes.map(({ span, lane, startIndex, endIndex, clippedStart, clippedEnd }) => {
                  const color = span.channelColor ?? '#64748b';
                  const text = readableTextColor(color);
                  const window =
                    span.from === span.to
                      ? span.from.slice(8, 10) + '/' + span.from.slice(5, 7)
                      : `${span.from.slice(8, 10)}/${span.from.slice(5, 7)} → ${span.to.slice(8, 10)}/${span.to.slice(5, 7)}`;

                  return (
                    <Link
                      key={span.id}
                      to={`/production/${span.id}`}
                      className={cn(
                        'absolute flex items-center gap-1 overflow-hidden px-1.5 text-[11px] font-medium leading-none transition-opacity hover:opacity-90',
                        // Le côté qui déborde du cadre reste carré : un bord arrondi se
                        // lirait comme une échéance, alors que la vidéo continue au-delà.
                        !clippedStart && 'rounded-l-full',
                        !clippedEnd && 'rounded-r-full',
                      )}
                      style={{
                        top: lane * LANE_HEIGHT + 2,
                        height: LANE_HEIGHT - 4,
                        left: `calc(${(startIndex * 100) / days.length}% + 2px)`,
                        width: `calc(${((endIndex - startIndex + 1) * 100) / days.length}% - 4px)`,
                        backgroundColor: color,
                        color: text,
                        // Une vidéo publiée n'attend plus rien : elle reste comme repère,
                        // en retrait de celles sur lesquelles il y a encore à faire.
                        opacity: span.status === 'done' ? 0.55 : 1,
                      }}
                      title={`${span.title}
${STATUS_LABELS[span.status]}${span.channelName ? ` · ${span.channelName}` : ''}
${window}${span.plannedDate ? ` · sortie le ${span.plannedDate.slice(8, 10)}/${span.plannedDate.slice(5, 7)}` : ''}`}
                    >
                      <span className="truncate">{span.title}</span>
                      {/* Le point marque la sortie, et il n'apparaît que si elle tombe
                        dans le cadre : sur une fenêtre tronquée à droite, le bord de la
                        barre n'est pas le jour de la sortie. */}
                      {span.plannedDate !== null && !clippedEnd && (
                        <span
                          className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-80"
                          aria-hidden
                        />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Les événements « journée entière » : ils étiquettent le jour sans l'occuper. */}
          {days.some((day) => day.events.some((event) => event.allDay)) && (
            <div className="flex border-b border-border bg-muted/30">
              <div className="sticky left-0 z-10 w-14 shrink-0 bg-card px-1 py-1 text-[10px] text-muted-foreground">
                journée
              </div>
              {days.map((day) => (
                <div key={day.date} className="flex-1 space-y-0.5 border-l border-border px-1 py-1">
                  {day.events
                    .filter((event) => event.allDay)
                    .map((event) => (
                      <p
                        key={event.uid}
                        className="truncate rounded bg-muted px-1 text-[11px] text-muted-foreground"
                        title={event.summary}
                      >
                        {event.summary}
                      </p>
                    ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex">
          {/* La règle des heures. */}
          <div className="sticky left-0 z-20 w-14 shrink-0 bg-card" style={{ height }}>
            <div className="relative h-full">
              {hourMarks.map((minutes) => (
                <span
                  key={minutes}
                  className="absolute right-1 -translate-y-1/2 text-[11px] text-muted-foreground"
                  style={{ top: yOf(minutes) }}
                >
                  {toTime(minutes)}
                </span>
              ))}

              {/* L'heure qu'il est, dans la gouttière. Elle a un fond opaque : sans lui,
                elle se superposerait au libellé de l'heure pleine la plus proche. */}
              {showNow && (
                <span
                  className="absolute right-1 -translate-y-1/2 rounded bg-[var(--now)] px-1 text-[11px] font-medium text-white"
                  style={{ top: yOf(nowMinutes) }}
                >
                  {toTime(nowMinutes)}
                </span>
              )}

              {/* L'heure visée pendant le déplacement, à la même place et dans la couleur
                du jour : c'est le seul endroit où l'œil va déjà chercher une heure. */}
              {drag !== null && (
                <span
                  className="absolute right-1 z-10 -translate-y-1/2 rounded bg-[var(--today)] px-1 text-[11px] font-medium text-white shadow"
                  style={{ top: yOf(drag.startMinutes) }}
                >
                  {toTime(drag.startMinutes)}
                </span>
              )}

              {/* Pendant un redimensionnement, c'est la FIN qu'on vise : le début n'a pas
                bougé, et c'est l'heure de fin qu'on cherche à caler sur une heure ronde. */}
              {resize !== null && (
                <span
                  className="absolute right-1 z-10 -translate-y-1/2 rounded bg-[var(--today)] px-1 text-[11px] font-medium text-white shadow"
                  style={{ top: yOf(resize.endMinutes) }}
                >
                  {toTime(resize.endMinutes)}
                </span>
              )}

              {/* Et pendant un dépôt venu de la pile, l'heure de début du bloc à poser. */}
              {activeGhost !== null && (
                <span
                  className="absolute right-1 z-10 -translate-y-1/2 rounded bg-[var(--today)] px-1 text-[11px] font-medium text-white shadow"
                  style={{ top: yOf(activeGhost.startMinutes) }}
                >
                  {toTime(activeGhost.startMinutes)}
                </span>
              )}
            </div>
          </div>

          <div ref={columnsRef} className="relative flex flex-1" style={{ height }}>
            {/* Les traits horaires, sur toute la largeur. */}
            {hourMarks.map((minutes) => (
              <div
                key={minutes}
                className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                style={{ top: yOf(minutes) }}
              />
            ))}

            {days.map((day, dayIndex) => {
              const isToday = day.date === today;
              const isTarget =
                (drag !== null && drag.targetIndex === dayIndex) ||
                (activeGhost !== null && activeGhost.dayIndex === dayIndex);

              return (
                <div
                  key={day.date}
                  className={cn(
                    'relative flex-1 border-l border-border transition-colors',
                    isToday && 'bg-[var(--today)]/5',
                    // La colonne survolée s'éclaire : sur sept colonnes, savoir où l'on
                    // va lâcher vaut mieux que de le découvrir après coup.
                    isTarget && 'bg-[var(--today)]/15',
                  )}
                >
                  {/* Les plages travaillables, en fond clair : hors d'elles, rien n'est posé. */}
                  {day.windows.map((window, index) => (
                    <div
                      key={`${day.date}-w${index}`}
                      className="pointer-events-none absolute inset-x-0 bg-background"
                      style={{
                        top: yOf(window.start),
                        height: yOf(window.end) - yOf(window.start),
                      }}
                    />
                  ))}

                  {/* L'agenda, en lecture seule. */}
                  {day.events
                    .filter((event) => !event.allDay && event.start !== null && event.end !== null)
                    .map((event) => (
                      <div
                        key={event.uid}
                        className="pointer-events-none absolute inset-x-0.5 overflow-hidden rounded border border-dashed border-muted-foreground/40 bg-muted/70 px-1 py-0.5"
                        style={{
                          top: yOf(event.start!),
                          height: Math.max(14, yOf(event.end!) - yOf(event.start!)),
                        }}
                        title={`${event.summary} (agenda)`}
                      >
                        <p className="truncate text-[11px] text-muted-foreground">
                          {event.summary}
                        </p>
                      </div>
                    ))}

                  {day.slots
                    .filter((slot) => slot.startTime && slot.endTime)
                    .map((slot) => {
                      const dragging = drag?.slotId === slot.id;
                      const resizing = resize?.slotId === slot.id;
                      // Pendant le geste, la hauteur suit le pointeur sans attendre le
                      // serveur : un bloc qui ne s'allonge qu'au relâchement donne
                      // l'impression que rien ne se passe.
                      const duration = resizing
                        ? resize.endMinutes - resize.startMinutes
                        : toMinutes(slot.endTime!) - toMinutes(slot.startTime!);

                      // Le bloc reste dans SA colonne et se décale d'un nombre entier de
                      // colonnes. Le déplacer dans le DOM emporterait la capture du
                      // pointeur, et le geste s'arrêterait au premier changement de jour.
                      const shown = dragging ? drag.startMinutes : toMinutes(slot.startTime!);
                      const offsetX = dragging
                        ? (drag.targetIndex - drag.originIndex) * drag.columnWidth
                        : 0;

                      const color = slot.stepColor ?? slot.channelColor ?? '#64748b';
                      const text = readableTextColor(color);
                      // Le chronomètre tourne sur ce créneau : l'anneau dit où le temps
                      // est en train de s'accumuler.
                      const ticking =
                        runningEntryId !== null && slot.timeEntryId === runningEntryId;

                      return (
                        <div
                          key={slot.id}
                          onPointerDown={(event) => startDrag(event, slot, duration)}
                          onPointerMove={moveDrag}
                          onPointerUp={() => endDrag(slot)}
                          onPointerCancel={() => setDrag(null)}
                          className={cn(
                            'group absolute inset-x-0.5 overflow-hidden rounded-md px-1.5 py-1 shadow-sm',
                            slot.done ? 'cursor-default' : 'cursor-grab active:cursor-grabbing',
                            dragging && 'z-30 opacity-90 shadow-lg',
                            ticking && 'ring-2 ring-[var(--positive)]',
                            // Une suggestion est en pointillés : elle n'a pas encore été vécue.
                            !slot.done && 'border-2 border-dashed',
                          )}
                          style={{
                            top: yOf(shown),
                            height: Math.max(20, (duration / 60) * HOUR_HEIGHT),
                            transform: offsetX === 0 ? undefined : `translateX(${offsetX}px)`,
                            backgroundColor: slot.done ? color : `${color}33`,
                            borderColor: color,
                            color: slot.done ? text : undefined,
                          }}
                          title={`${slot.productionTitle}\n${slot.label || slot.stepName || ''}\n${slot.startTime} – ${slot.endTime}${slot.done ? '\n(approuvé)' : ''}`}
                        >
                          {/* Pendant le geste, l'heure prend la place du titre : sur un
                              bloc d'un quart d'heure il n'y a de place que pour une ligne,
                              et c'est l'heure qu'on veut y lire, pas un nom qu'on connaît
                              déjà. Le jour suit, parce qu'on déplace aussi de colonne. */}
                          <p className="truncate text-[11px] font-medium leading-tight">
                            {dragging
                              ? `${toTime(drag.startMinutes)} – ${toTime(drag.startMinutes + duration)}`
                              : resizing
                                ? // On rallonge une séance : c'est la durée obtenue qu'on
                                  // veut lire, pas l'heure de fin, déjà annoncée dans la
                                  // gouttière.
                                  `${toTime(resize.startMinutes)} – ${toTime(resize.endMinutes)} · ${formatMinutes(duration)}`
                                : slot.label || slot.stepName || slot.productionTitle}
                          </p>
                          {duration >= 45 && (
                            <p className="truncate text-[10px] leading-tight opacity-80">
                              {dragging
                                ? `${WEEKDAY_SHORT[days[drag.targetIndex]?.weekday ?? 0]} ${days[drag.targetIndex]?.date.slice(8, 10) ?? ''}`
                                : slot.productionTitle}
                            </p>
                          )}

                          {/* Les actions n'apparaissent qu'au survol : sur un bloc de trois
                              quarts d'heure, deux boutons permanents mangeraient le titre. */}
                          <div className="absolute right-0.5 top-0.5 hidden gap-0.5 group-focus-within:flex group-hover:flex">
                            {/* La fiche de la vidéo est à un clic de partout ailleurs dans
                                l'outil, et c'est depuis un créneau qu'on veut le plus
                                souvent y aller : relire le script avant de s'y mettre.
                                `onPointerDown` neutralisé, sinon le lien démarrerait un
                                glissement au lieu de naviguer. */}
                            <Link
                              to={`/production/${slot.productionId}`}
                              className="rounded bg-background/90 p-0.5 hover:bg-background"
                              title={`Ouvrir « ${slot.productionTitle} »`}
                              onPointerDown={(event) => event.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              <span className="sr-only">Ouvrir la fiche de la vidéo</span>
                            </Link>
                            {slot.done ? (
                              <>
                                {/* Un créneau approuvé ne se glisse plus : le déplacer au
                                    doigt réécrirait du temps déjà vécu par accident. Il
                                    reste corrigeable au clavier, parce qu'on se trompe
                                    d'heure en confirmant. */}
                                <button
                                  type="button"
                                  className="rounded bg-background/90 p-0.5 hover:bg-background"
                                  title="Corriger l’horaire de ce créneau"
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={() => onEditTime(slot)}
                                >
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                  <span className="sr-only">Changer l’heure</span>
                                </button>
                                <button
                                  type="button"
                                  className="rounded bg-background/90 p-0.5 hover:bg-background"
                                  title="Annuler l’approbation : la session de travail est retirée"
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={() => onUnapprove(slot)}
                                >
                                  <Undo2 className="h-3 w-3 text-muted-foreground" />
                                  <span className="sr-only">Annuler l’approbation</span>
                                </button>
                              </>
                            ) : (
                              <>
                                {/* Le chronomètre plutôt que l'approbation quand on s'y
                                    met maintenant : à l'arrêt, le créneau prendra les
                                    horaires réellement passés au lieu des prévus. */}
                                <button
                                  type="button"
                                  className="rounded bg-background/90 p-0.5 hover:bg-background"
                                  title={
                                    ticking
                                      ? 'Le chronomètre tourne sur ce créneau'
                                      : 'Démarrer le chronomètre sur cette tâche'
                                  }
                                  disabled={ticking}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={() => onStartTimer(slot)}
                                >
                                  {ticking ? (
                                    <Timer className="h-3 w-3 text-[var(--positive)]" />
                                  ) : (
                                    <Play className="h-3 w-3" />
                                  )}
                                  <span className="sr-only">Démarrer le chronomètre</span>
                                </button>
                                <button
                                  type="button"
                                  className="rounded bg-background/90 p-0.5 hover:bg-background"
                                  title="J’ai passé ce temps"
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={() => onApprove(slot)}
                                >
                                  <Check className="h-3 w-3 text-[var(--positive)]" />
                                  <span className="sr-only">Approuver</span>
                                </button>
                                <button
                                  type="button"
                                  className="rounded bg-background/90 p-0.5 hover:bg-background"
                                  title="Retirer ce créneau"
                                  onPointerDown={(event) => event.stopPropagation()}
                                  onClick={() => onDelete(slot)}
                                >
                                  <Trash2 className="h-3 w-3 text-destructive" />
                                  <span className="sr-only">Supprimer</span>
                                </button>
                              </>
                            )}
                          </div>

                          {/* La poignée de redimensionnement : le bord bas du bloc.
                              Absente sur un créneau approuvé — sa durée est celle de la
                              session de travail enregistrée, et la tirer ici les ferait
                              diverger sans que le compteur de la vidéo bouge. On corrige
                              alors le temps passé sur la fiche.

                              Elle reste **invisible tant qu'on ne survole pas** : deux
                              pixels de couleur permanents en bas de chaque bloc se
                              liraient comme une bordure de plus. */}
                          {!slot.done && (
                            <div
                              onPointerDown={(event) => startResize(event, slot)}
                              onPointerMove={moveResize}
                              onPointerUp={() => endResize(slot)}
                              onPointerCancel={() => setResize(null)}
                              className={cn(
                                'absolute inset-x-0 bottom-0 h-2 cursor-ns-resize',
                                'after:absolute after:inset-x-3 after:bottom-0.5 after:h-0.5 after:rounded-full after:bg-current after:opacity-0 group-hover:after:opacity-40',
                                resizing && 'after:opacity-70',
                              )}
                              title="Tirer pour allonger ou raccourcir"
                            />
                          )}
                        </div>
                      );
                    })}

                  {/* Le fantôme de la tâche qu'on est en train de déposer. En pointillés
                      et sans action : ce n'est pas encore un créneau, il n'existera qu'au
                      relâchement. */}
                  {activeGhost !== null && activeGhost.dayIndex === dayIndex && pendingItem && (
                    <div
                      className="pointer-events-none absolute inset-x-0.5 z-20 overflow-hidden rounded-md border-2 border-dashed px-1.5 py-1 opacity-90 shadow-lg"
                      style={{
                        top: yOf(activeGhost.startMinutes),
                        height: Math.max(20, (pendingMinutes / 60) * HOUR_HEIGHT),
                        borderColor: pendingItem.stepColor ?? pendingItem.channelColor ?? '#64748b',
                        backgroundColor: `${pendingItem.stepColor ?? pendingItem.channelColor ?? '#64748b'}33`,
                      }}
                    >
                      <p className="truncate text-[11px] font-medium leading-tight">
                        {toTime(activeGhost.startMinutes)} –{' '}
                        {toTime(activeGhost.startMinutes + pendingMinutes)}
                      </p>
                      <p className="truncate text-[10px] leading-tight opacity-80">
                        {pendingItem.label}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Le trait de visée : il traverse la grille à la hauteur du début visé, et
                c'est lui qui dit sur quelle ligne le bloc va retomber. En pointillés pour
                ne pas se confondre avec le trait plein de « maintenant ». */}
            {drag !== null && (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 border-t border-dashed border-[var(--today)]"
                style={{ top: yOf(drag.startMinutes) }}
              />
            )}

            {/* L'heure qu'il est. Le trait traverse toute la largeur — sur une semaine, il
                sert à situer l'heure sur les sept colonnes —, et la pastille marque la
                colonne du jour, seule à porter un « maintenant » qui a un sens.
                Dessiné en dernier, donc au-dessus des créneaux : c'est un repère, il ne
                doit pas se faire recouvrir par un bloc de trois heures. */}
            {showNow && (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-[var(--now)]"
                style={{ top: yOf(nowMinutes) }}
              >
                <span
                  className="absolute h-2 w-2 -translate-y-1/2 rounded-full bg-[var(--now)]"
                  style={{ left: `calc(${(todayIndex * 100) / days.length}% - 1px)` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
