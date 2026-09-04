import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, DollarSign, Package } from 'lucide-react';
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { STATUS_LABELS } from '../../../domain/production/entities/Production.ts';
import { PRODUCT_STATUS_LABELS } from '../../../domain/product/entities/Product.ts';
import { SPONSORSHIP_STATUS_LABELS } from '../../../domain/sponsorship/entities/Sponsorship.ts';
import { formatMoney } from '../../../shared/format.ts';
import type { ProductionStep } from '../../../domain/production/entities/ProductionStep.ts';
import type { ProductionSlot } from '../../../domain/production/entities/ProductionSlot.ts';
import { formatSlotTime } from '../../../domain/production/entities/ProductionSlot.ts';
import { toIsoDate } from '../../../shared/format.ts';
import { readableTextColor } from '../../../shared/contrast.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { cn } from '../../../shared/cn.ts';

type Zoom = 'weeks' | 'month' | 'quarter';

/**
 * Les fenêtres du planning.
 *
 * `before` couvre volontairement du passé : la vue défile horizontalement et s'ouvre
 * centrée sur aujourd'hui, donc ce qui vient de sortir doit rester atteignable d'un
 * glissement vers la gauche — sans quoi on ne pourrait jamais reculer.
 */
const ZOOM: Record<Zoom, { label: string; before: number; after: number; cell: number }> = {
  weeks: { label: '3 semaines', before: 14, after: 35, cell: 44 },
  month: { label: '2 mois', before: 30, after: 75, cell: 22 },
  quarter: { label: '4 mois', before: 60, after: 150, cell: 11 },
};

/** Largeur de la colonne des titres, retranchée pour centrer le jour et non la grille. */
const TITLE_WIDTH = 224;

/** Au-delà, le planning prend toute la page avant même qu'on ait vu la file d'attente. */
const COLLAPSED_ROWS = 5;

/** Couleur de repli quand la vidéo n'a pas encore de chaîne : neutre, jamais transparente. */
const NO_CHANNEL_COLOR = '#64748b';

/** Part d'étapes cochées, en pourcentage entier. */
const progressPercent = (production: Production, total: number): number =>
  total === 0 ? 0 : Math.round((production.steps.length / total) * 100);

/** Infobulle de la barre : tout ce que le rognage a pu manger. */
const barTitle = (production: Production, total: number): string =>
  [
    production.title,
    STATUS_LABELS[production.status],
    production.channelName,
    total > 0 ? `${progressPercent(production, total)} % d'avancement` : null,
  ]
    .filter(Boolean)
    .join(' · ');

/**
 * Détail des sponsos et des produits d'une barre.
 *
 * Une infobulle native et non le panneau HTML des cartes : le planning défile
 * horizontalement dans un conteneur qui rogne, un panneau positionné en absolu y serait
 * coupé dès qu'on approche du bord. Le texte multi-ligne fait le travail sans ça.
 */
const sponsorshipsTitle = (production: Production): string =>
  [
    `Sponsos (${production.sponsorships.length}) :`,
    ...production.sponsorships.map(
      (s) =>
        `· ${s.label} — ${formatMoney(s.amountCents)} — ${SPONSORSHIP_STATUS_LABELS[s.status]}`,
    ),
  ].join('\n');

const productsTitle = (production: Production): string =>
  [
    `Produits (${production.products.length}) :`,
    ...production.products.map(
      (p) => `· ${p.name} — ${formatMoney(p.valueCents)} — ${PRODUCT_STATUS_LABELS[p.status]}`,
    ),
  ].join('\n');

interface ProductionGanttProps {
  productions: Production[];
  slots: ProductionSlot[];
  /** Sert à calculer l'avancement : le pourcentage n'a de sens que rapporté au total. */
  steps: ProductionStep[];
}

/**
 * Le calendrier des vidéos, en barres.
 *
 * Construit en grille CSS plutôt qu'avec une bibliothèque de Gantt : une barre par
 * production, une colonne par jour, et rien d'autre à faire que de compter des jours.
 *
 * La barre va de la date de début à la date de sortie visée. Sans date de début, elle
 * occupe le seul jour visé : une vidéo qu'on n'a pas encore commencé à planifier ne
 * doit pas paraître étalée sur trois semaines.
 *
 * **La couleur dit la chaîne, le contenu dit l'avancement.** Répéter le nom de la chaîne
 * dans la barre serait redondant avec sa couleur ; l'état, les pastilles d'argent et le
 * pourcentage, eux, ne se lisent nulle part ailleurs sur cette vue.
 *
 * L'ordre dans la barre suit ce qui doit survivre au rognage : les icônes et le
 * pourcentage sont `shrink-0`, c'est le libellé d'état qui se tronque en premier — sur
 * une barre d'un jour, savoir qu'il y a une sponso vaut mieux que lire « En cours ».
 *
 * La couleur du texte est calculée pour chaque fond (`readableTextColor`) : du blanc sur
 * un vert clair ne se lit pas.
 */
export const ProductionGantt = ({ productions, slots, steps }: ProductionGanttProps) => {
  const [zoom, setZoom] = useState<Zoom>('month');
  const [expanded, setExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Les vidéos encore à faire d'abord : le planning sert à préparer, pas à archiver.
  const planned = useMemo(
    () =>
      productions
        .filter((production) => production.plannedDate ?? production.startDate)
        .sort((a, b) => {
          if ((a.status === 'done') !== (b.status === 'done')) return a.status === 'done' ? 1 : -1;
          return (a.plannedDate ?? a.startDate ?? '').localeCompare(
            b.plannedDate ?? b.startDate ?? '',
          );
        }),
    [productions],
  );

  const rows = expanded ? planned : planned.slice(0, COLLAPSED_ROWS);
  const hidden = planned.length - rows.length;

  const todayColumn = columnOf(toIsoDate(new Date()));
  /**
   * Le trait se pose au **milieu** de la cellule du jour, pas à son bord gauche.
   *
   * Au bord, il tombe exactement sur la frontière entre hier et aujourd'hui : on ne sait
   * plus lequel des deux jours il désigne, et la lecture hésite en permanence. Au centre,
   * il appartient sans ambiguïté à sa colonne.
   */
  const todayOffset = todayColumn * cell + cell / 2;
  const gridStyle = { gridTemplateColumns: `repeat(${days.length}, ${cell}px)` };

  /**
   * Ouvre la vue centrée sur aujourd'hui, et la recentre à chaque changement de zoom.
   *
   * Sans ça, le planning s'ouvrait collé à sa borne gauche : on voyait d'abord des jours
   * passés, et il fallait faire défiler pour trouver le présent — exactement ce qu'on
   * vient chercher. Le décalage retranche la colonne des titres, qui ne défile pas.
   */
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const visibleWidth = container.clientWidth - TITLE_WIDTH;
    container.scrollLeft = Math.max(0, todayOffset - visibleWidth / 2);
  }, [zoom, todayOffset]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle>Planning</CardTitle>
          <p className="text-sm text-muted-foreground">
            Du début du travail à la date de sortie visée. La couleur est la chaîne, les points sont
            tes créneaux.
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
          <>
            <div ref={scrollRef} className="overflow-x-auto">
              <div className="min-w-max">
                {/* En-tête : le lundi porte l'étiquette, les autres jours le numéro. */}
                <div className="sticky top-0 z-10 flex bg-card">
                  <div className="sticky left-0 z-20 w-56 shrink-0 bg-card" />
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
                  {rows.map((production) => {
                    const end = production.plannedDate ?? production.startDate!;
                    const start = production.startDate ?? end;
                    const from = columnOf(start);
                    const to = columnOf(end);
                    const span = Math.max(1, to - from + 1);
                    const color = production.channelColor ?? NO_CHANNEL_COLOR;
                    const done = production.status === 'done';

                    return (
                      <div key={production.id} className="flex items-center">
                        {/* Collée à gauche : en défilant vers le futur, on doit continuer
                            de savoir de quelle vidéo est la barre qu'on regarde. */}
                        <Link
                          to={`/production/${production.id}`}
                          className={cn(
                            'sticky left-0 z-20 w-56 shrink-0 truncate bg-card pr-3 text-sm hover:underline',
                            done && 'text-muted-foreground',
                          )}
                          title={production.title}
                        >
                          {production.title}
                        </Link>

                        <div className="relative grid h-7 items-center" style={gridStyle}>
                          {/* Trait d'aujourd'hui, posé sur toute la hauteur de la ligne. */}
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 z-0 w-px bg-[var(--negative)]/60"
                            style={{ left: todayOffset }}
                          />

                          {/* La barre entière est cliquable : c'est la cible la plus large
                              de la ligne, et celle qu'on vise naturellement. */}
                          <Link
                            to={`/production/${production.id}`}
                            className="z-10 flex h-5 items-center gap-1 overflow-hidden rounded px-1.5 text-[11px] font-medium transition-opacity hover:opacity-80"
                            style={{
                              gridColumn: `${from + 1} / span ${span}`,
                              backgroundColor: color,
                              color: readableTextColor(color),
                              opacity: done ? 0.55 : 1,
                            }}
                            title={barTitle(production, steps.length)}
                          >
                            {production.sponsorships.length > 0 && (
                              <span className="shrink-0" title={sponsorshipsTitle(production)}>
                                <DollarSign className="h-3 w-3" aria-hidden />
                                <span className="sr-only">{sponsorshipsTitle(production)}</span>
                              </span>
                            )}
                            {production.products.length > 0 && (
                              <span className="shrink-0" title={productsTitle(production)}>
                                <Package className="h-3 w-3" aria-hidden />
                                <span className="sr-only">{productsTitle(production)}</span>
                              </span>
                            )}
                            <span className="truncate">{STATUS_LABELS[production.status]}</span>
                            {steps.length > 0 && (
                              <span className="ml-auto shrink-0 tabular">
                                {progressPercent(production, steps.length)} %
                              </span>
                            )}
                          </Link>

                          {(slotsByProduction.get(production.id) ?? [])
                            .filter((slot) => isVisible(slot.date))
                            .map((slot) => (
                              <span
                                key={slot.id}
                                aria-hidden
                                className={cn(
                                  'pointer-events-none z-20 mx-auto h-2 w-2 rounded-full ring-2 ring-card',
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

            {(hidden > 0 || expanded) && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full text-muted-foreground"
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? (
                  <>
                    <ChevronUp className="h-4 w-4" />
                    Réduire le planning
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-4 w-4" />
                    Afficher les {hidden} autres vidéos
                  </>
                )}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
