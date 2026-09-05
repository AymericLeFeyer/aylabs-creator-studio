import { addDays, parseIsoDate, type IsoDate } from '../../../shared/dates.ts';

/**
 * Le moteur de placement : où poser, dans une semaine déjà remplie, le travail qui
 * reste à faire.
 *
 * Fonction **pure** et sans accès aux dépôts : elle prend des plages travaillables, des
 * occupations et une liste de tâches ordonnées, et rend des blocs. C'est ce qui permet
 * de la rejouer autant de fois qu'on veut — « réorganiser ce jour », « repositionner
 * tout » — sans jamais dépendre de ce qui est déjà en base.
 *
 * Deux règles la gouvernent, et elles ne se négocient pas :
 *
 * - **L'ordre est strict.** La tâche n+1 ne commence pas avant que la tâche n ait reçu
 *   toutes ses minutes. Caler le montage avant le tournage remplirait joliment un
 *   agenda sans rien permettre de faire.
 * - **Ce qui est occupé est intouchable.** Les occupations passées en entrée réunissent
 *   les événements de l'agenda **et** les créneaux déjà approuvés : le moteur ne
 *   déplace jamais du temps déjà vécu.
 */

/** Minutes depuis minuit. Toutes les heures du planning s'expriment ainsi. */
export interface Interval {
  start: number;
  end: number;
}

export interface BusyBlock extends Interval {
  date: IsoDate;
}

/** Une tâche à caler. L'ordre du tableau **est** la priorité. */
export interface PlanTask {
  id: string;
  minutes: number;
}

export interface PlacedBlock extends Interval {
  taskId: string;
  date: IsoDate;
}

export interface ScheduleInput {
  from: IsoDate;
  horizonDays: number;
  /** Plages travaillables par jour de semaine (0 = lundi). Absent = jour non travaillé. */
  workHours: Map<number, Interval[]>;
  busy: BusyBlock[];
  tasks: PlanTask[];
  granularityMinutes: number;
  minBlockMinutes: number;
  maxBlockMinutes: number;
  breakMinutes: number;
  /**
   * L'instant avant lequel rien ne se pose : il est 15 h, on ne propose pas un créneau
   * de 9 h. Il vient **du navigateur** et non de l'horloge du serveur — l'API tourne en
   * UTC dans un conteneur, et s'y fier décalerait la journée de deux heures en été.
   *
   * Il porte une **date** et pas seulement une heure : le plancher doit s'appliquer au
   * jour qui est réellement aujourd'hui, et non au premier jour de l'horizon. Les deux
   * coïncidaient dans le cas courant, mais pas quand le placement repart d'une date
   * passée (une session de travail matérialisée après coup) — et le moteur posait alors
   * des créneaux à des heures déjà écoulées.
   */
  notBefore?: { date: IsoDate; minutes: number };
}

export interface ScheduleResult {
  blocks: PlacedBlock[];
  /** Ce que l'horizon n'a pas pu absorber. Le front le dit plutôt que de le taire. */
  unplaced: Array<{ taskId: string; minutes: number }>;
}

/** Jour de la semaine d'une date, 0 = lundi (même convention que `bucketStart`). */
export const weekdayOf = (date: IsoDate): number => (parseIsoDate(date).getUTCDay() + 6) % 7;

/** Arrondit au multiple supérieur : un créneau commence sur un pas rond. */
const ceilTo = (value: number, step: number): number =>
  step > 1 ? Math.ceil(value / step) * step : Math.round(value);

/**
 * Retire les occupations d'une liste de plages.
 * Les fragments plus courts qu'une minute sont abandonnés : ils ne portent rien.
 */
export const subtractBusy = (windows: Interval[], busy: Interval[]): Interval[] => {
  let result = windows.map((w) => ({ ...w })).filter((w) => w.end > w.start);

  for (const block of busy) {
    const next: Interval[] = [];
    for (const window of result) {
      if (block.end <= window.start || block.start >= window.end) {
        next.push(window);
        continue;
      }
      if (block.start > window.start) next.push({ start: window.start, end: block.start });
      if (block.end < window.end) next.push({ start: block.end, end: window.end });
    }
    result = next.filter((w) => w.end - w.start >= 1);
  }

  return result.sort((a, b) => a.start - b.start);
};

/** Les espaces libres de chaque jour de l'horizon, dans l'ordre chronologique. */
export const freeWindows = (
  input: Pick<ScheduleInput, 'from' | 'horizonDays' | 'workHours' | 'busy' | 'notBefore'>,
): Array<{ date: IsoDate; windows: Interval[] }> => {
  const busyByDate = new Map<IsoDate, Interval[]>();
  for (const block of input.busy) {
    const list = busyByDate.get(block.date) ?? [];
    list.push({ start: block.start, end: block.end });
    busyByDate.set(block.date, list);
  }

  const days: Array<{ date: IsoDate; windows: Interval[] }> = [];
  for (let offset = 0; offset < input.horizonDays; offset += 1) {
    const date = addDays(input.from, offset);
    const base = input.workHours.get(weekdayOf(date)) ?? [];
    if (base.length === 0) {
      days.push({ date, windows: [] });
      continue;
    }

    // Le jour courant est tronqué à l'heure qu'il est : le reste de la journée seulement.
    // Un jour antérieur est **entièrement fermé** — on ne planifie pas dans le passé,
    // même si l'appelant a demandé de repartir d'une date déjà écoulée.
    const bounded =
      input.notBefore && date < input.notBefore.date
        ? []
        : base
            .map((w) => ({
              start: Math.max(
                w.start,
                input.notBefore && date === input.notBefore.date ? input.notBefore.minutes : 0,
              ),
              end: w.end,
            }))
            .filter((w) => w.end > w.start);

    days.push({ date, windows: subtractBusy(bounded, busyByDate.get(date) ?? []) });
  }

  return days;
};

/**
 * Cale les tâches dans les espaces libres, dans l'ordre reçu.
 *
 * Une tâche plus longue que `maxBlockMinutes` est **découpée en plusieurs séances** :
 * personne ne monte six heures d'affilée, et un bloc qui ne rentre nulle part ne serait
 * jamais posé. À l'inverse le reliquat final est posé même s'il est plus court que
 * `minBlockMinutes` — sinon les dernières minutes d'une tâche ne trouveraient jamais
 * leur place et la ligne resterait éternellement ouverte.
 */
export const schedule = (input: ScheduleInput): ScheduleResult => {
  const days = freeWindows(input);
  const blocks: PlacedBlock[] = [];
  const unplaced: ScheduleResult['unplaced'] = [];

  // Curseur global : il n'avance jamais en arrière, c'est lui qui garantit l'ordre.
  let dayIndex = 0;
  let windowIndex = 0;
  let cursor = -1;

  const currentWindow = (): Interval | null => {
    while (dayIndex < days.length) {
      const day = days[dayIndex]!;
      if (windowIndex < day.windows.length) {
        const window = day.windows[windowIndex]!;
        if (cursor < window.start) cursor = window.start;
        if (cursor < window.end) return window;
        windowIndex += 1;
        cursor = -1;
        continue;
      }
      dayIndex += 1;
      windowIndex = 0;
      cursor = -1;
    }
    return null;
  };

  for (const task of input.tasks) {
    let remaining = Math.max(0, Math.round(task.minutes));
    let placedForTask = 0;

    while (remaining > 0) {
      const window = currentWindow();
      if (!window) break;

      const start = ceilTo(cursor, input.granularityMinutes);
      const available = window.end - start;
      // Un espace résiduel trop court : on passe au suivant plutôt que d'y poser une miette.
      const wanted = Math.min(remaining, input.maxBlockMinutes);
      const floor = Math.min(input.minBlockMinutes, remaining);
      if (available < floor) {
        windowIndex += 1;
        cursor = -1;
        continue;
      }

      const duration = Math.min(wanted, available);
      blocks.push({ taskId: task.id, date: days[dayIndex]!.date, start, end: start + duration });
      remaining -= duration;
      placedForTask += duration;
      cursor = start + duration + input.breakMinutes;
    }

    if (remaining > 0) unplaced.push({ taskId: task.id, minutes: remaining });
    // Une tâche dont rien n'a été placé ne doit pas bloquer les suivantes : le curseur
    // est déjà au bout de l'horizon, elles finiront dans `unplaced` de la même façon.
    void placedForTask;
  }

  return { blocks, unplaced };
};
