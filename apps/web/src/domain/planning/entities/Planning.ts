import type { ProductionStatus } from '../../production/entities/Production.ts';
import type { ProductionSlot } from '../../production/entities/ProductionSlot.ts';

/**
 * Contrat de `/api/planning`, dupliqué depuis l'API — comme tout le reste du front.
 * **Toute évolution doit être répercutée des deux côtés.**
 */

/** Minutes depuis minuit. Tout le planning s'exprime ainsi, jamais en `Date`. */
export interface Interval {
  start: number;
  end: number;
}

/**
 * Une plage travaillable de la semaine type. `weekday` va de 0 (lundi) à 6 (dimanche).
 *
 * **Plusieurs plages par jour** : une journée coupée par la pause du midi est le cas
 * normal, et une seule plage ferait poser un créneau de montage à 12 h 30. Un jour sans
 * aucune plage n'est simplement pas travaillé.
 */
export interface WorkHours {
  id: string;
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface WorkHoursInput {
  weekday: number;
  startTime: string;
  endTime: string;
}

export const WEEKDAY_LABELS = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
] as const;

/** Version courte pour les en-têtes de colonne du planning. */
export const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'] as const;

export interface PlanningSettings {
  calendarBaseUrl: string | null;
  targetCalendarId: string | null;
  busyCalendarIds: string[];
  slotGranularityMinutes: number;
  minBlockMinutes: number;
  maxBlockMinutes: number;
  breakMinutes: number;
  horizonDays: number;
  pushToCalendar: boolean;
  /** Le jeton lui-même ne sort jamais de l'API : seul le fait qu'il existe est exposé. */
  hasToken: boolean;
  updatedAt: string;
}

export type PlanningSettingsInput = Partial<
  Omit<PlanningSettings, 'hasToken' | 'updatedAt'> & { calendarToken: string | null }
>;

export interface CalendarRef {
  id: string;
  name: string;
}

export interface CalendarEvent {
  uid: string;
  calendarId: string;
  summary: string;
  date: string;
  /** `null` sur une journée entière : elle n'occupe aucune heure précise. */
  start: number | null;
  end: number | null;
  allDay: boolean;
}

export type PlanningItemStatus = 'pending' | 'done' | 'cancelled';

/**
 * Une ligne de la pile de travail : « il reste à écrire l'accroche de cette vidéo ».
 *
 * Elle disparaît de la pile quand la tâche est cochée — **sans emporter les créneaux
 * déjà posés**, qui racontent le temps passé et non le travail restant.
 *
 * **L'ordre de travail se déduit** : file d'attente des vidéos, puis ordre des étapes,
 * puis ordre des tâches. On finit une vidéo avant d'attaquer la suivante. Pour le changer,
 * on réordonne la file sur `/production` — un rang propre à la pile pouvait la contredire.
 */
export interface PlanningItem {
  id: string;
  productionId: string;
  stepId: string | null;
  todoId: string | null;
  label: string;
  plannedMinutes: number;
  sequence: number;
  status: PlanningItemStatus;
  productionTitle: string;
  /** Rang de la vidéo dans la file d'attente : c'est lui qui ordonne le travail. */
  productionOrder: number;
  /** Rang de l'étape dans le référentiel, second critère de tri. */
  stepOrder: number;
  channelId: string | null;
  channelColor: string | null;
  stepName: string | null;
  stepColor: string | null;
  plannedDate: string | null;
  /** Minutes déjà couvertes par des créneaux pas encore approuvés. */
  scheduledMinutes: number;
  /** Minutes déjà approuvées : du travail réellement fait. */
  approvedMinutes: number;
}

export interface PlanningDay {
  date: string;
  weekday: number;
  windows: Interval[];
  slots: ProductionSlot[];
  events: CalendarEvent[];
  suggestedMinutes: number;
  approvedMinutes: number;
}

/**
 * La fenêtre de travail d'une vidéo, projetée sur la grille : de quand à quand cette
 * vidéo occupe le calendrier.
 *
 * Elle ne se déduit pas des créneaux : une vidéo peut avoir une période annoncée sans
 * qu'aucune heure n'ait encore été posée, et c'est justement ce qu'on veut voir. Les
 * bornes sont **celles de la production** et non celles de la période affichée : la
 * grille sait ainsi quel côté déborde du cadre, et le dit.
 */
export interface PlanningProductionSpan {
  id: string;
  title: string;
  status: ProductionStatus;
  channelName: string | null;
  channelColor: string | null;
  from: string;
  to: string;
  /** Le jour de sortie visé, s'il est posé : c'est lui qui porte l'échéance. */
  plannedDate: string | null;
}

export interface PlanningBoard {
  from: string;
  to: string;
  days: PlanningDay[];
  items: PlanningItem[];
  /** Les fenêtres de travail des vidéos qui recoupent la période, la plus tôt d'abord. */
  productions: PlanningProductionSpan[];
  calendarConnected: boolean;
  calendarError: string | null;
  hasWorkHours: boolean;
}

export interface PlanTargetsInput {
  productionId: string;
  stepIds: string[];
  todoIds: string[];
  from?: string;
  /** Voir `planningNow` : le jour et l'heure d'ici, sans lesquels l'API planifie en UTC. */
  nowDate?: string;
  nowMinutes?: number;
}

export interface ApproveSlotInput {
  finished: boolean;
  minutes?: number;
  notes?: string | null;
  from?: string;
  nowDate?: string;
  nowMinutes?: number;
}

/**
 * Combien de temps réserver quand on pose soi-même un créneau sur une ligne de la pile.
 *
 * **Dupliquée à l'identique côté API** (`defaultSlotMinutes`), comme `slotMinutes` : le
 * bloc fantôme qui suit le curseur pendant le glisser-déposer doit faire exactement la
 * taille du créneau qui sera posé, sinon il saute de hauteur au relâchement.
 *
 * Le reste à couvrir d'abord, plafonné par `maxBlockMinutes`. Quand il ne reste rien —
 * la ligne est déjà couverte, ou on repose un deuxième bloc parce que le montage ne se
 * fera pas d'une traite — la durée retombe sur `minBlockMinutes` : **poser un bloc de
 * plus doit rester possible**.
 */
export const defaultSlotMinutes = (
  item: Pick<PlanningItem, 'plannedMinutes' | 'scheduledMinutes' | 'approvedMinutes'>,
  sizing: Pick<PlanningSettings, 'minBlockMinutes' | 'maxBlockMinutes' | 'slotGranularityMinutes'>,
): number => {
  const uncovered = item.plannedMinutes - item.approvedMinutes - item.scheduledMinutes;
  const base = uncovered > 0 ? uncovered : sizing.minBlockMinutes;
  return Math.max(
    sizing.slotGranularityMinutes,
    Math.min(sizing.maxBlockMinutes, Math.round(base)),
  );
};

/** `540` → `09:00`. Le seul format d'heure du planning. */
export const toTime = (minutes: number): string => {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
};

/** `09:00` → `540`. */
export const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

/** « 1 h 30 », « 45 min ». Une durée se lit, elle ne se calcule pas de tête. */
export const formatMinutes = (minutes: number): string => {
  const rounded = Math.max(0, Math.round(minutes));
  const hours = Math.floor(rounded / 60);
  const rest = rounded % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
};

/**
 * Les bornes horaires à afficher pour une journée.
 *
 * La grille ne commence pas à minuit : elle s'ouvre sur la première plage travaillable
 * et se ferme sur la dernière, élargies par ce qui déborde — un créneau déplacé à la
 * main hors des horaires doit rester visible, sinon il disparaîtrait sans prévenir.
 */
export const dayBounds = (days: PlanningDay[]): Interval => {
  let start = 24 * 60;
  let end = 0;

  for (const day of days) {
    for (const window of day.windows) {
      start = Math.min(start, window.start);
      end = Math.max(end, window.end);
    }
    for (const slot of day.slots) {
      if (!slot.startTime || !slot.endTime) continue;
      start = Math.min(start, toMinutes(slot.startTime));
      end = Math.max(end, toMinutes(slot.endTime));
    }
    for (const event of day.events) {
      if (event.allDay || event.start === null || event.end === null) continue;
      start = Math.min(start, event.start);
      end = Math.max(end, event.end);
    }
  }

  // Aucune plage, aucun créneau : une journée de bureau plutôt qu'une grille vide de
  // hauteur nulle, sur laquelle rien ne pourrait être déposé.
  if (end <= start) return { start: 8 * 60, end: 20 * 60 };
  return { start: Math.max(0, start - 30), end: Math.min(24 * 60, end + 30) };
};
