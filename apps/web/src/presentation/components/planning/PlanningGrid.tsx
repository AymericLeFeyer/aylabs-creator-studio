import { useRef, useState } from 'react';
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
  date: string;
  startMinutes: number;
  durationMinutes: number;
}

/**
 * La grille du planning : une colonne par jour, les heures en ordonnée.
 *
 * Écrite à la main, sans bibliothèque de calendrier ni de drag & drop. Le besoin tient
 * en une conversion « pixels ↔ minutes » et trois écouteurs de pointeur, là où une
 * dépendance imposerait son modèle d'événement, son thème et sa gestion du fuseau — le
 * même parti pris que le Gantt et les confettis.
 *
 * Les événements de l'agenda sont dessinés **en fond, en lecture seule** : ils occupent
 * la place, on ne les déplace pas depuis ici. Un créneau **approuvé** est verrouillé de
 * la même façon — il raconte du temps déjà passé, le déplacer réécrirait le passé.
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

  const yOf = (minutes: number) => ((minutes - bounds.start) / 60) * HOUR_HEIGHT;
  const minutesOf = (y: number) => bounds.start + (y / HOUR_HEIGHT) * 60;

  /** Les traits horaires, une ligne par heure pleine. */
  const hourMarks: number[] = [];
  for (let m = Math.ceil(bounds.start / 60) * 60; m <= bounds.end; m += 60) hourMarks.push(m);

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
    const block = event.currentTarget as HTMLElement;
    block.setPointerCapture(event.pointerId);
    const rect = block.getBoundingClientRect();
    setDrag({
      slotId: slot.id,
      grabOffset: event.clientY - rect.top,
      date: slot.date,
      startMinutes: toMinutes(slot.startTime ?? '00:00'),
      durationMinutes: duration,
    });
  };

  const moveDrag = (event: React.PointerEvent) => {
    if (!drag || !columnsRef.current) return;
    const container = columnsRef.current.getBoundingClientRect();
    const columnWidth = container.width / Math.max(1, days.length);
    const index = Math.min(
      days.length - 1,
      Math.max(0, Math.floor((event.clientX - container.left) / columnWidth)),
    );

    const rawStart = minutesOf(event.clientY - container.top - drag.grabOffset);
    const snapped = Math.round(rawStart / DRAG_STEP) * DRAG_STEP;
    const clamped = Math.max(0, Math.min(24 * 60 - drag.durationMinutes, snapped));

    setDrag({ ...drag, date: days[index]?.date ?? drag.date, startMinutes: clamped });
  };

  const endDrag = (slot: ProductionSlot) => {
    if (!drag) return;
    const moved = drag.date !== slot.date || drag.startMinutes !== toMinutes(slot.startTime ?? '');
    if (moved) onMove(slot, drag.date, drag.startMinutes);
    setDrag(null);
  };

  return (
    <div className={cn('overflow-x-auto', busy && 'pointer-events-none opacity-60')}>
      <div className="min-w-[720px]">
        {/* En-têtes : le jour, sa charge, et son bouton de réorganisation. */}
        <div className="flex border-b border-border">
          <div className="w-14 shrink-0" />
          {days.map((day) => {
            const isToday = day.date === today;
            return (
              <div
                key={day.date}
                className={cn(
                  'flex-1 border-l border-border px-2 py-1.5',
                  isToday && 'bg-accent/40',
                )}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="min-w-0">
                    <p
                      className={cn(
                        'truncate text-xs font-medium',
                        isToday ? 'text-primary' : 'text-foreground',
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

            {days.map((day) => (
              <div
                key={day.date}
                className={cn(
                  'relative flex-1 border-l border-border',
                  day.date === today && 'bg-accent/20',
                )}
              >
                {/* Les plages travaillables, en fond clair : hors d'elles, rien n'est posé. */}
                {day.windows.map((window, index) => (
                  <div
                    key={`${day.date}-w${index}`}
                    className="pointer-events-none absolute inset-x-0 bg-background"
                    style={{ top: yOf(window.start), height: yOf(window.end) - yOf(window.start) }}
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
                      <p className="truncate text-[11px] text-muted-foreground">{event.summary}</p>
                    </div>
                  ))}

                {day.slots
                  .filter((slot) => slot.startTime && slot.endTime)
                  .map((slot) => {
                    const duration = toMinutes(slot.endTime!) - toMinutes(slot.startTime!);
                    const dragging = drag?.slotId === slot.id;
                    const shown =
                      dragging && drag.date === day.date
                        ? drag.startMinutes
                        : toMinutes(slot.startTime!);
                    if (dragging && drag.date !== day.date) return null;

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
                          dragging && 'z-20 opacity-90 shadow-lg',
                          // Une suggestion est en pointillés : elle n'a pas encore été vécue.
                          !slot.done && 'border-2 border-dashed',
                        )}
                        style={{
                          top: yOf(shown),
                          height: Math.max(20, (duration / 60) * HOUR_HEIGHT),
                          backgroundColor: slot.done ? color : `${color}33`,
                          borderColor: color,
                          color: slot.done ? text : undefined,
                        }}
                        title={`${slot.productionTitle}\n${slot.label || slot.stepName || ''}\n${slot.startTime} – ${slot.endTime}${slot.done ? '\n(approuvé)' : ''}`}
                      >
                        <p className="truncate text-[11px] font-medium leading-tight">
                          {slot.label || slot.stepName || slot.productionTitle}
                        </p>
                        {duration >= 45 && (
                          <p className="truncate text-[10px] leading-tight opacity-80">
                            {slot.productionTitle}
                          </p>
                        )}

                        {/* Les actions n'apparaissent qu'au survol : sur un bloc de trois
                            quarts d'heure, deux boutons permanents mangeraient le titre. */}
                        <div className="absolute right-0.5 top-0.5 hidden gap-0.5 group-hover:flex group-focus-within:flex">
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
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
