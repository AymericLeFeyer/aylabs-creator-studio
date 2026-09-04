import { useEffect, useRef, useState } from 'react';
import { Check, Trash2, Undo2, Wand2 } from 'lucide-react';
import type { ProductionSlot } from '../../../domain/production/entities/ProductionSlot.ts';
import {
  dayBounds,
  formatMinutes,
  toMinutes,
  toTime,
  WEEKDAY_SHORT,
  type PlanningDay,
} from '../../../domain/planning/entities/Planning.ts';
import { Button } from '../ui/button.tsx';
import { cn } from '../../../shared/cn.ts';
import { readableTextColor } from '../../../shared/contrast.ts';

/** Hauteur d'une heure de grille, en pixels. */
const HOUR_HEIGHT = 56;

/** Pas de déplacement au drag : on ne cale pas un créneau à la minute près. */
const DRAG_STEP = 15;

export interface PlanningGridProps {
  days: PlanningDay[];
  today: string;
  onMove: (slot: ProductionSlot, date: string, startMinutes: number) => void;
  onApprove: (slot: ProductionSlot) => void;
  /** Défaire une approbation : la session de travail part, le créneau redevient mobile. */
  onUnapprove: (slot: ProductionSlot) => void;
  onDelete: (slot: ProductionSlot) => void;
  onReorganizeDay: (date: string) => void;
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
  today,
  onMove,
  onApprove,
  onUnapprove,
  onDelete,
  onReorganizeDay,
  busy = false,
}: PlanningGridProps) => {
  const bounds = dayBounds(days);
  const totalMinutes = bounds.end - bounds.start;
  const height = (totalMinutes / 60) * HOUR_HEIGHT;
  const columnsRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

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

  return (
    <div className={cn('overflow-x-auto', busy && 'pointer-events-none opacity-60')}>
      <div className="min-w-[720px]">
        {/* En-têtes : le jour, sa charge, et son bouton de réorganisation. */}
        <div className="flex border-b border-border">
          <div className="w-14 shrink-0" />
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

        {/* Les événements « journée entière » : ils étiquettent le jour sans l'occuper. */}
        {days.some((day) => day.events.some((event) => event.allDay)) && (
          <div className="flex border-b border-border bg-muted/30">
            <div className="w-14 shrink-0 px-1 py-1 text-[10px] text-muted-foreground">journée</div>
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

        <div className="flex">
          {/* La règle des heures. */}
          <div className="relative w-14 shrink-0" style={{ height }}>
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
              const isTarget = drag !== null && drag.targetIndex === dayIndex;

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
                      const duration = toMinutes(slot.endTime!) - toMinutes(slot.startTime!);
                      const dragging = drag?.slotId === slot.id;

                      // Le bloc reste dans SA colonne et se décale d'un nombre entier de
                      // colonnes. Le déplacer dans le DOM emporterait la capture du
                      // pointeur, et le geste s'arrêterait au premier changement de jour.
                      const shown = dragging ? drag.startMinutes : toMinutes(slot.startTime!);
                      const offsetX = dragging
                        ? (drag.targetIndex - drag.originIndex) * drag.columnWidth
                        : 0;

                      const color = slot.stepColor ?? slot.channelColor ?? '#64748b';
                      const text = readableTextColor(color);

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
                            {slot.done ? (
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
                            ) : (
                              <>
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
                        </div>
                      );
                    })}
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
