import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { STATUS_COLORS, STATUS_LABELS } from '../../../domain/production/entities/Production.ts';
import type { ProductionSlot } from '../../../domain/production/entities/ProductionSlot.ts';
import { formatSlotTime } from '../../../domain/production/entities/ProductionSlot.ts';
import { toIsoDate } from '../../../shared/format.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { cn } from '../../../shared/cn.ts';

type Zoom = 'weeks' | 'month' | 'quarter';

const ZOOM: Record<Zoom, { label: string; before: number; after: number; cell: number }> = {
  weeks: { label: '3 semaines', before: 3, after: 17, cell: 44 },
  month: { label: '2 mois', before: 7, after: 52, cell: 22 },
  quarter: { label: '4 mois', before: 14, after: 106, cell: 11 },
};

interface ProductionGanttProps {
  productions: Production[];
  slots: ProductionSlot[];
}

/**
 * Le calendrier des vidéos, en barres.
 *
 * Construit en grille CSS plutôt qu'avec une bibliothèque de Gantt : une barre par
 * production, une colonne par jour, et rien d'autre à faire que de compter des jours —
 * une dépendance de plus pour ça serait mal placée, et aucune ne s'accorderait au thème.
 *
 * La barre va de la date de début à la date de sortie visée. Sans date de début, elle
 * occupe le seul jour visé : une vidéo qu'on n'a pas encore commencée à planifier ne
 * doit pas paraître étalée sur trois semaines.
 */
export const ProductionGantt = ({ productions, slots }: ProductionGanttProps) => {
  const [zoom, setZoom] = useState<Zoom>('month');
  const { before, after, cell } = ZOOM[zoom];

  const { days, first } = useMemo(() => {
    const start = addDays(new Date(), -before);
    const total = before + after;
    return {
      first: start,
      days: Array.from({ length: total }, (_, index) => addDays(start, index)),
    };
  }, [before, after]);

  const slotsByProduction = useMemo(() => {
    const map = new Map<string, ProductionSlot[]>();
    for (const slot of slots) {
      const list = map.get(slot.productionId) ?? [];
      list.push(slot);
      map.set(slot.productionId, list);
    }
    return map;
  }, [slots]);

  /** Position d'une date dans la grille, ramenée dans les bornes visibles. */
  const columnOf = (date: string): number =>
    Math.max(0, Math.min(days.length - 1, differenceInCalendarDays(parseISO(date), first)));

  const isVisible = (date: string): boolean => {
    const offset = differenceInCalendarDays(parseISO(date), first);
    return offset >= 0 && offset < days.length;
  };

  const planned = productions.filter((p) => p.plannedDate ?? p.startDate);
  const todayColumn = columnOf(toIsoDate(new Date()));
  const gridStyle = { gridTemplateColumns: `repeat(${days.length}, ${cell}px)` };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle>Planning</CardTitle>
          <p className="text-sm text-muted-foreground">
            Du début du travail à la date de sortie visée. Les points sont tes créneaux.
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-sm">
          {(Object.keys(ZOOM) as Zoom[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setZoom(key)}
              className={cn(
                'rounded-md px-2.5 py-1 font-medium transition-colors',
                zoom === key
                  ? 'bg-background text-foreground shadow'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {ZOOM[key].label}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {planned.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Aucune vidéo datée. Renseigne une date de sortie visée pour la voir apparaître ici.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-max">
              {/* En-tête : le lundi porte l'étiquette, les autres jours le numéro. */}
              <div className="sticky top-0 z-10 flex bg-card">
                <div className="w-56 shrink-0" />
                <div className="grid" style={gridStyle}>
                  {days.map((day) => {
                    const monday = day.getDay() === 1;
                    const weekend = day.getDay() === 0 || day.getDay() === 6;
                    return (
                      <div
                        key={day.toISOString()}
                        className={cn(
                          'border-l border-border/60 pb-1 text-center text-[10px] leading-tight',
                          weekend ? 'text-muted-foreground/50' : 'text-muted-foreground',
                        )}
                      >
                        {monday || zoom === 'weeks' ? (
                          <>
                            <span className="block">{format(day, 'd', { locale: fr })}</span>
                            {monday && (
                              <span className="block font-medium">
                                {format(startOfWeek(day, { weekStartsOn: 1 }), 'MMM', {
                                  locale: fr,
                                })}
                              </span>
                            )}
                          </>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-1.5 pt-2">
                {planned.map((production) => {
                  const end = production.plannedDate ?? production.startDate!;
                  const start = production.startDate ?? end;
                  const from = columnOf(start);
                  const to = columnOf(end);
                  const span = Math.max(1, to - from + 1);
                  const color = production.channelColor ?? STATUS_COLORS[production.status];

                  return (
                    <div key={production.id} className="flex items-center">
                      <Link
                        to={`/production/${production.id}`}
                        className="w-56 shrink-0 truncate pr-3 text-sm hover:underline"
                        title={production.title}
                      >
                        {production.title}
                      </Link>

                      <div className="relative grid h-7 items-center" style={gridStyle}>
                        {/* Trait d'aujourd'hui, posé sur toute la hauteur de la ligne. */}
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-0 z-0 w-px bg-[var(--negative)]/60"
                          style={{ left: todayColumn * cell }}
                        />

                        <div
                          className="z-10 flex h-5 items-center gap-1 overflow-hidden rounded px-1.5 text-[11px] font-medium text-white"
                          style={{
                            gridColumn: `${from + 1} / span ${span}`,
                            backgroundColor: color,
                            opacity: production.status === 'done' ? 0.45 : 1,
                          }}
                          title={`${production.title} — ${STATUS_LABELS[production.status]}`}
                        >
                          <span className="truncate">{production.channelName ?? ''}</span>
                        </div>

                        {(slotsByProduction.get(production.id) ?? [])
                          .filter((slot) => isVisible(slot.date))
                          .map((slot) => (
                            <span
                              key={slot.id}
                              aria-hidden
                              className={cn(
                                'z-20 mx-auto h-2 w-2 rounded-full ring-2 ring-card',
                                slot.done ? 'bg-muted-foreground' : 'bg-foreground',
                              )}
                              style={{ gridColumn: `${columnOf(slot.date) + 1} / span 1` }}
                              title={`${slot.label || 'Créneau'} · ${formatSlotTime(slot)}`}
                            />
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
