import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, DollarSign, Package } from 'lucide-react';
import { addDays, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns';
import { fr } from 'date-fns/locale';
import type { Production } from '../../../domain/production/entities/Production.ts';
import {
  PRODUCTION_STATUSES,
  STATUS_COLORS,
  STATUS_LABELS,
} from '../../../domain/production/entities/Production.ts';
import { useChannels } from '../../../application/channel/usecases/useChannels.ts';
import { useUpdateProduction } from '../../../application/production/usecases/useProductions.ts';
import { PRODUCT_STATUS_LABELS } from '../../../domain/product/entities/Product.ts';
import { SPONSORSHIP_STATUS_LABELS } from '../../../domain/sponsorship/entities/Sponsorship.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { toIsoDate } from '../../../shared/format.ts';
import { ChannelAvatar } from '../filters/ChannelAvatar.tsx';
import { Button } from '../ui/button.tsx';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '../ui/card.tsx';
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
/**
 * Largeur de repli de la colonne des titres, en pixels.
 *
 * Elle n'est plus une constante d'affichage — la colonne est **plus étroite sur mobile**
 * (`w-36`), sinon elle mangeait 224 px sur un écran de 390 et il ne restait rien pour les
 * barres. Le calcul de centrage la mesure donc sur le DOM ; cette valeur ne sert que
 * pendant le premier rendu, avant que la mesure soit disponible.
 */
const TITLE_WIDTH = 224;

/** Le point de rupture `lg` de Tailwind, lu une fois à l'ouverture. */
const isLargeScreen = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches;

/** Au-delà, le planning prend toute la page avant même qu'on ait vu la file d'attente. */
const COLLAPSED_ROWS = 5;

/**
 * Encre du texte des barres.
 *
 * Les couleurs de statut sont des variables du thème (`oklch`), que `readableTextColor` ne
 * sait pas lire. Elles sont toutes à mi-clarté dans les deux thèmes, et l'encre sombre y
 * contraste au moins autant que le blanc — mieux sur le vert et l'orange.
 */
const BAR_INK = '#0f172a';

/** Les deux dates qu'une barre représente — et les seules qu'un geste sur elle modifie. */
interface BarDates {
  startDate: string | null;
  plannedDate: string | null;
}

/** `move` déplace la barre entière, `start` / `end` tirent l'un de ses bords. */
type DragMode = 'move' | 'start' | 'end';

interface DragState {
  id: string;
  mode: DragMode;
  originX: number;
  /** Décalage en jours entiers : on ne cale pas une sortie à la demi-journée. */
  delta: number;
  moved: boolean;
}

/** En deçà, un appui suivi d'un relâchement reste un clic qui ouvre la fiche. */
const DRAG_THRESHOLD_PX = 4;

const shiftIso = (iso: string, days: number): string => toIsoDate(addDays(parseISO(iso), days));

const formatDay = (iso: string): string => format(parseISO(iso), 'd MMM yyyy', { locale: fr });

/** L'infobulle d'une barre : un rappel des dates, rien d'autre — la couleur dit l'état. */
const datesLabel = ({ startDate, plannedDate }: BarDates): string => {
  if (startDate && plannedDate && startDate !== plannedDate) {
    return `Du ${formatDay(startDate)} au ${formatDay(plannedDate)}`;
  }
  if (plannedDate) return `Sortie visée le ${formatDay(plannedDate)}`;
  return startDate ? `Début le ${formatDay(startDate)}` : '';
};

/**
 * Les dates qu'un geste produit.
 *
 * Une barre sans `startDate` n'occupe que le jour visé : la déplacer ne lui invente pas de
 * début, seule une date existante est décalée. Tirer un bord, en revanche, pose la date qui
 * manquait — c'est précisément ce qu'on demande en étirant une barre d'un jour. Les bords
 * ne se croisent jamais : un début ne passe pas après la sortie.
 */
const applyDrag = (production: BarDates, mode: DragMode, delta: number): BarDates => {
  const end = production.plannedDate ?? production.startDate!;
  const start = production.startDate ?? end;
  if (mode === 'move') {
    return {
      startDate: production.startDate ? shiftIso(production.startDate, delta) : null,
      plannedDate: production.plannedDate ? shiftIso(production.plannedDate, delta) : null,
    };
  }
  if (mode === 'start') {
    const shifted = shiftIso(start, delta);
    const next = shifted > end ? end : shifted;
    return {
      startDate: next === end && !production.startDate ? null : next,
      plannedDate: production.plannedDate ?? end,
    };
  }
  const shifted = shiftIso(end, delta);
  const next = shifted < start ? start : shifted;
  return {
    startDate: production.startDate ?? (next === start ? null : start),
    plannedDate: next,
  };
};

const datesKey = (dates: BarDates): string => `${dates.startDate}|${dates.plannedDate}`;

/**
 * Largeur d'un texte en 11 px / 500, lue par un canevas plutôt que devinée : c'est ce qui
 * décide si le titre tient dans sa barre ou en sort. Repli grossier sans DOM.
 */
let measureContext: CanvasRenderingContext2D | null | undefined;
const textWidth = (text: string): number => {
  if (measureContext === undefined) {
    measureContext =
      typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
    if (measureContext) {
      measureContext.font = `500 11px ${getComputedStyle(document.body).fontFamily}`;
    }
  }
  return measureContext ? measureContext.measureText(text).width : text.length * 6;
};

/**
 * Détail des sponsos et des produits d'une barre.
 *
 * Une infobulle native et non le panneau HTML des cartes : le planning défile
 * horizontalement dans un conteneur qui rogne, un panneau positionné en absolu y serait
 * coupé dès qu'on approche du bord. Le texte multi-ligne fait le travail sans ça.
 */
/**
 * Le formateur est **passé en argument** plutôt qu'importé : ces deux fonctions sont
 * pures et vivent hors de tout composant, or la confidentialité est un état de contexte.
 * Leur donner le formateur de l'appelant les garde pures et masque les montants jusque
 * dans une infobulle native, qu'aucun rendu React ne traverse.
 */
type MoneyFormat = (cents: number) => string;

const sponsorshipsTitle = (production: Production, money: MoneyFormat): string =>
  [
    `Sponsos (${production.sponsorships.length}) :`,
    ...production.sponsorships.map(
      (s) => `· ${s.label} — ${money(s.amountCents)} — ${SPONSORSHIP_STATUS_LABELS[s.status]}`,
    ),
  ].join('\n');

const productsTitle = (production: Production, money: MoneyFormat): string =>
  [
    `Produits (${production.products.length}) :`,
    ...production.products.map(
      (p) => `· ${p.name} — ${money(p.valueCents)} — ${PRODUCT_STATUS_LABELS[p.status]}`,
    ),
  ].join('\n');

interface ProductionGanttProps {
  productions: Production[];
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
 * **La couleur dit l'état, la miniature dit la chaîne.** L'état est ce qu'on balaie du
 * regard sur un calendrier (qu'est-ce qui est bloqué, qu'est-ce qui n'a pas commencé) ;
 * la chaîne se reconnaît à son logo en tête de barre, sans prendre la couleur pour elle.
 *
 * La barre porte le **titre** de la vidéo, pas son état (la couleur le dit déjà) ; trop
 * long, il sort à droite de la barre. L'infobulle ne rappelle que les dates. La barre se
 * **glisse** pour décaler début et sortie ensemble, et ses **bords se tirent** pour n'en
 * changer qu'un — sans ouvrir la fiche. Un trait vertical par lundi découpe les semaines.
 *
 * Au survol, toute la ligne s'éclaire et la barre prend un contour : c'est ce qui relie
 * une barre lointaine à son titre, collé à gauche.
 */
export const ProductionGantt = ({ productions }: ProductionGanttProps) => {
  const privacy = usePrivacy();
  const sponsorMoney = (cents: number) => privacy.money(cents, 'sponsorships');
  const productMoney = (cents: number) => privacy.money(cents, 'inKind');
  // Sur mobile, 4 mois et rien à régler : le sélecteur est masqué, faute de place pour
  // lui à côté du titre, et une fenêtre de 2 mois sur 390 px ne montre que quelques jours.
  const [zoom, setZoom] = useState<Zoom>(() => (isLargeScreen() ? 'month' : 'quarter'));
  const [expanded, setExpanded] = useState(false);
  const { data: channels = [] } = useChannels();
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Le coin de l'en-tête : il porte la largeur réelle de la colonne des titres. */
  const titleRef = useRef<HTMLDivElement>(null);
  const { before, after, cell } = ZOOM[zoom];
  const update = useUpdateProduction();

  const [drag, setDrag] = useState<DragState | null>(null);
  const dragRef = useRef<DragState | null>(null);
  /** Un glissement se termine par un `click` sur la barre : il ne doit pas ouvrir la fiche. */
  const swallowClick = useRef(false);

  /**
   * Les dates posées par un geste, en attendant que l'API les renvoie.
   *
   * Sans ça, la barre revenait à sa place le temps de l'aller-retour puis repartait. Une
   * entrée ne vaut que tant que la production porte encore les dates d'avant le geste
   * (`base`) : dès que la réponse arrive — ou qu'une autre écriture change les dates —
   * elle s'efface d'elle-même, sans effet ni nettoyage.
   */
  const [pending, setPending] = useState<Record<string, { base: string; dates: BarDates }>>({});
  const effective = useMemo(
    () =>
      productions.map((production) => {
        const entry = pending[production.id];
        return entry && entry.base === datesKey(production)
          ? { ...production, ...entry.dates }
          : production;
      }),
    [productions, pending],
  );

  const commit = (production: Production, dates: BarDates) => {
    if (datesKey(dates) === datesKey(production)) return;
    setPending((current) => ({
      ...current,
      [production.id]: { base: datesKey(production), dates },
    }));
    update.mutate(
      { id: production.id, input: dates },
      {
        onError: () =>
          setPending((current) => {
            const next = { ...current };
            delete next[production.id];
            return next;
          }),
      },
    );
  };

  /**
   * Le geste vit sur l'enveloppe de la barre, qui capture le pointeur : sortir de la ligne
   * en glissant ne l'interrompt pas. Le bord saisi se lit sur `data-handle`.
   */
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>, id: string) => {
    swallowClick.current = false;
    if (event.button !== 0) return;
    const handle = (event.target as HTMLElement).closest<HTMLElement>('[data-handle]');
    const mode = (handle?.dataset.handle as DragMode | undefined) ?? 'move';
    event.currentTarget.setPointerCapture(event.pointerId);
    const state = { id, mode, originX: event.clientX, delta: 0, moved: false };
    dragRef.current = state;
    setDrag(state);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const current = dragRef.current;
    if (!current) return;
    const dx = event.clientX - current.originX;
    const moved = current.moved || Math.abs(dx) > DRAG_THRESHOLD_PX;
    const delta = moved ? Math.round(dx / cell) : 0;
    if (delta === current.delta && moved === current.moved) return;
    const next = { ...current, delta, moved };
    dragRef.current = next;
    setDrag(next);
  };

  const onPointerUp = (production: Production) => {
    const current = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    if (!current) return;
    swallowClick.current = current.moved;
    if (current.moved && current.delta !== 0) {
      commit(production, applyDrag(production, current.mode, current.delta));
    }
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    setDrag(null);
  };

  const { days, first } = useMemo(() => {
    const start = addDays(new Date(), -before);
    const total = before + after;
    return {
      first: start,
      days: Array.from({ length: total }, (_, index) => addDays(start, index)),
    };
  }, [before, after]);

  /** Position d'une date dans la grille, ramenée dans les bornes visibles. */
  const columnOf = (date: string): number =>
    Math.max(0, Math.min(days.length - 1, differenceInCalendarDays(parseISO(date), first)));

  /**
   * L'ordre des lignes : la chronologie, sauf pour ce qui est **terminé ET déjà passé**.
   *
   * Une vidéo bouclée en avance — publiée, ou prête et marquée terminée avant sa date —
   * reste à sa place dans le calendrier : elle occupe toujours ce créneau de sortie, et la
   * renvoyer en bas faisait croire que la semaine était vide. Elle y reste **grisée**
   * (titre et barre en retrait), pour qu'on ne la confonde pas avec du travail à faire.
   *
   * Seules les terminées dont l'échéance est **passée** ferment la marche : elles n'ont plus
   * rien à dire sur ce qui vient, et le planning sert à préparer, pas à archiver.
   *
   * L'échéance est la sortie visée, ou le début à défaut — la même date qui borne la barre.
   */
  const planned = useMemo(() => {
    const today = toIsoDate(new Date());
    const deadlineOf = (production: Production) =>
      production.plannedDate ?? production.startDate ?? '';
    const archived = (production: Production) =>
      production.status === 'done' && deadlineOf(production) < today;

    return effective
      .filter((production) => production.plannedDate ?? production.startDate)
      .sort((a, b) => {
        if (archived(a) !== archived(b)) return archived(a) ? 1 : -1;
        return deadlineOf(a).localeCompare(deadlineOf(b));
      });
  }, [effective]);

  /**
   * Les lundis, où commence chaque semaine. Un trait par lundi, sur toute la hauteur :
   * « cette vidéo sort la semaine prochaine » se lit alors sans compter les colonnes.
   */
  const mondays = useMemo(
    () => days.flatMap((day, index) => (day.getDay() === 1 ? [index] : [])),
    [days],
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
  const hasRows = planned.length > 0;
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    // Mesurée et non supposée : la colonne change de largeur avec la taille d'écran, et
    // un centrage calculé sur 224 px décalerait la vue de 80 px sur un téléphone.
    const titleWidth = titleRef.current?.offsetWidth ?? TITLE_WIDTH;
    const visibleWidth = container.clientWidth - titleWidth;
    container.scrollLeft = Math.max(0, todayOffset - visibleWidth / 2);
    // `hasRows` : au premier rendu les vidéos ne sont souvent pas encore chargées, le
    // conteneur n'existe pas, et sans cette dépendance l'effet ne se rejouait jamais —
    // le Gantt s'ouvrait alors sur sa borne gauche, deux mois dans le passé.
  }, [zoom, todayOffset, hasRows]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3 pb-3">
        <div>
          <CardTitle>Planning</CardTitle>
          {/* Descriptif, légende et période : au large seulement. Sur un téléphone ils
              repoussaient la grille sous le pli, et on vient y chercher les barres. */}
          <CardDescription className="hidden text-sm text-muted-foreground lg:block">
            Du début du travail à la date de sortie visée. La couleur est l'état, le logo la chaîne.
          </CardDescription>
          {/* Légende : la couleur ne se devine pas, et elle a changé de sens. */}
          <div className="mt-1.5 hidden flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground lg:flex">
            {PRODUCTION_STATUSES.map((status) => (
              <span key={status} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: STATUS_COLORS[status] }}
                />
                {STATUS_LABELS[status]}
              </span>
            ))}
          </div>
        </div>
        <div className="hidden items-center gap-1 rounded-lg bg-muted p-1 text-sm lg:flex">
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
            {/* `isolate` : les z-index ci-dessous (10 à 50) ne valent QUE dans le Gantt.
                Sans contexte d'empilement propre, ils entraient en concurrence avec ceux de
                l'application — en-tête collant et barre du bas (30), voile du tiroir (40) —,
                et en faisant défiler la page, les titres et la ligne des dates passaient
                par-dessus l'en-tête, pendant que les panneaux de survol des cartes du
                dessus (30) passaient sous le Gantt. Même correction que `PlanningGrid`.

                Le conteneur défile aussi **verticalement**, borné en hauteur : un `sticky`
                ne colle qu'à l'ancêtre qui défile réellement, et tant que le Gantt suivait
                la page, la ligne des dates partait avec les premières vidéos dès qu'on
                dépliait la liste. */}
            <div
              ref={scrollRef}
              className="relative isolate max-h-[min(70vh,44rem)] overflow-auto overscroll-x-contain"
            >
              <div className="min-w-max">
                {/* En-tête : le lundi porte l'étiquette, les autres jours le numéro. */}
                {/* L'ordre d'empilement du Gantt, du fond vers la surface : barres (10),
                    trait d'aujourd'hui (20), colonne des titres (30), en-tête des jours
                    (40) et son coin (50). Le trait passe PAR-DESSUS les barres : sous
                    elles, il disparaissait précisément sur les vidéos en cours — celles
                    dont la barre couvre aujourd'hui. Les pastilles de créneau ont été
                    retirées : un point par créneau, sur une barre colorée, ne se lisait pas. */}
                <div className="sticky top-0 z-40 flex bg-card">
                  <div
                    ref={titleRef}
                    className="sticky left-0 z-50 w-36 shrink-0 border-r border-border bg-card lg:w-56"
                  />
                  <div className="grid" style={gridStyle}>
                    {days.map((day) => {
                      const monday = day.getDay() === 1;
                      const weekend = day.getDay() === 0 || day.getDay() === 6;
                      return (
                        <div
                          key={day.toISOString()}
                          className={cn(
                            'border-l pb-1 text-center text-[10px] leading-tight',
                            // Le lundi porte le même trait que les lignes du dessous.
                            monday ? 'border-foreground/25' : 'border-border/60',
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

                {/* Pas d'écart entre les lignes : les traits de semaine les traversent d'un
                    seul tenant, un `space-y` les aurait hachés à chaque vidéo. */}
                <div className="pt-1">
                  {rows.map((production) => {
                    const dragging = drag?.id === production.id ? drag : null;
                    const dates =
                      dragging && dragging.moved
                        ? applyDrag(production, dragging.mode, dragging.delta)
                        : production;
                    const end = dates.plannedDate ?? dates.startDate!;
                    const start = dates.startDate ?? end;
                    const from = columnOf(start);
                    const to = columnOf(end);
                    const span = Math.max(1, to - from + 1);
                    const color = STATUS_COLORS[production.status];
                    const done = production.status === 'done';
                    // Le référentiel porte la miniature ; la vue de production n'a que le nom
                    // et la couleur, qui suffisent au repli (initiale sur la couleur).
                    const channel = production.channelId
                      ? (channels.find((item) => item.id === production.channelId) ??
                        (production.channelName
                          ? {
                              name: production.channelName,
                              color: production.channelColor ?? '#64748b',
                              thumbnailUrl: null,
                            }
                          : null))
                      : null;
                    // Pendant le geste, le texte annonce les dates visées à la place du titre :
                    // la grille n'a pas d'autre repère, et on poserait la sortie à l'aveugle.
                    const label = dragging?.moved ? datesLabel(dates) : production.title;
                    // Padding, logo et icônes d'argent : ce qui reste au texte dans la barre.
                    const reserved =
                      8 +
                      (channel ? 18 : 0) +
                      (production.sponsorships.length > 0 ? 16 : 0) +
                      (production.products.length > 0 ? 16 : 0);
                    const fits = textWidth(label) <= span * cell - reserved;

                    return (
                      // La ligne entière s'éclaire au survol, colonne des titres comprise :
                      // sur une barre posée loin à droite, c'est la seule façon de voir de
                      // quelle vidéo il s'agit sans suivre la ligne des yeux.
                      <div
                        key={production.id}
                        className="group flex items-stretch rounded-sm transition-colors hover:bg-muted"
                      >
                        {/* Collée à gauche : en défilant vers le futur, on doit continuer
                            de savoir de quelle vidéo est la barre qu'on regarde. */}
                        <Link
                          to={`/production/${production.id}`}
                          className={cn(
                            // `self-stretch` : sans lui, le fond de la colonne ne couvrait
                            // que la hauteur du texte, et le trait d'aujourd'hui comme les
                            // barres transparaissaient au-dessus et en dessous en défilant.
                            'sticky left-0 z-30 flex w-36 shrink-0 items-center self-stretch',
                            'border-r border-border bg-card pr-3 text-sm hover:underline lg:w-56',
                            // Opaque, comme le fond de ligne : la colonne est collante et
                            // les barres défilent dessous.
                            'transition-colors group-hover:bg-muted group-hover:font-medium',
                            done && 'text-muted-foreground',
                          )}
                          title={production.title}
                        >
                          <span className="truncate">{production.title}</span>
                        </Link>

                        <div className="relative grid h-8 items-center" style={gridStyle}>
                          {/* Un trait par lundi : le découpage en semaines, du lundi au
                              dimanche, sur toute la hauteur de la ligne. */}
                          {mondays.map((index) => (
                            <span
                              key={index}
                              aria-hidden
                              className="pointer-events-none absolute inset-y-0 w-px bg-foreground/25"
                              style={{ left: index * cell }}
                            />
                          ))}

                          {/* Trait d'aujourd'hui, posé sur toute la hauteur de la ligne et
                              au-dessus des barres. Épais de 3 px et centré sur son offset :
                              un trait d'un pixel se perdait dans les filets de la grille. */}
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 z-20 w-[3px] -translate-x-1/2 rounded-full bg-[var(--negative)]"
                            style={{ left: todayOffset }}
                          />

                          {/* L'enveloppe porte le geste : glisser la barre la déplace, tirer
                              un bord ne déplace que lui. Un simple clic ouvre toujours la
                              fiche. Pas de `touch-none` sur le corps de la barre : au doigt,
                              le planning doit continuer de défiler — seuls les bords captent. */}
                          <div
                            className="relative z-10 flex h-5 select-none"
                            style={{ gridColumn: `${from + 1} / span ${span}` }}
                            onPointerDown={(event) => onPointerDown(event, production.id)}
                            onPointerMove={onPointerMove}
                            onPointerUp={() => onPointerUp(production)}
                            onPointerCancel={onPointerCancel}
                          >
                            <Link
                              to={`/production/${production.id}`}
                              draggable={false}
                              onClick={(event) => {
                                if (swallowClick.current) {
                                  event.preventDefault();
                                  swallowClick.current = false;
                                }
                              }}
                              className={cn(
                                'group/bar relative flex w-full items-center gap-1 overflow-hidden rounded px-1 text-[11px] font-medium transition-shadow group-hover:shadow-[0_0_0_2px_var(--foreground)]',
                                dragging?.moved
                                  ? 'cursor-grabbing shadow-[0_0_0_2px_var(--foreground)]'
                                  : 'cursor-grab',
                              )}
                              style={{
                                backgroundColor: color,
                                color: BAR_INK,
                                opacity: done ? 0.55 : 1,
                              }}
                              title={datesLabel(production)}
                            >
                              {/* En tête, et `shrink-0` : sur une barre d'un jour, c'est la
                                  dernière chose à disparaître avec les pastilles d'argent. */}
                              {channel && (
                                <ChannelAvatar
                                  channel={channel}
                                  size={14}
                                  className="ring-1 ring-black/10"
                                />
                              )}
                              {production.sponsorships.length > 0 && (
                                <span
                                  className="shrink-0"
                                  title={sponsorshipsTitle(production, sponsorMoney)}
                                >
                                  <DollarSign className="h-3 w-3" aria-hidden />
                                  <span className="sr-only">
                                    {sponsorshipsTitle(production, sponsorMoney)}
                                  </span>
                                </span>
                              )}
                              {production.products.length > 0 && (
                                <span
                                  className="shrink-0"
                                  title={productsTitle(production, productMoney)}
                                >
                                  <Package className="h-3 w-3" aria-hidden />
                                  <span className="sr-only">
                                    {productsTitle(production, productMoney)}
                                  </span>
                                </span>
                              )}
                              {fits && <span className="whitespace-nowrap">{label}</span>}

                              {/* Les deux bords, saisissables : tirer à gauche avance ou
                                  recule le début, à droite la sortie visée. */}
                              {(['start', 'end'] as const).map((edge) => (
                                <span
                                  key={edge}
                                  data-handle={edge}
                                  aria-hidden
                                  className={cn(
                                    'absolute inset-y-0 w-2 cursor-ew-resize touch-none transition-colors group-hover/bar:bg-black/15',
                                    edge === 'start' ? 'left-0' : 'right-0',
                                  )}
                                />
                              ))}
                            </Link>

                            {/* Trop long pour la barre : le titre en sort, à droite, dans
                                l'encre du thème — l'encre des barres ne se lirait pas sur le
                                fond de la carte en mode sombre. */}
                            {!fits && (
                              <span
                                className={cn(
                                  'pointer-events-none absolute left-full top-1/2 ml-1.5 -translate-y-1/2 whitespace-nowrap text-[11px] font-medium',
                                  done ? 'text-muted-foreground' : 'text-foreground',
                                )}
                              >
                                {label}
                              </span>
                            )}
                          </div>
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
