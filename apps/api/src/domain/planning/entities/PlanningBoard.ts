import type { IsoDate } from '../../../shared/dates.ts';
import type { ProductionSlotView } from '../../production/entities/ProductionSlot.ts';
import type { CalendarEvent } from './CalendarEvent.ts';
import type { PlanningItemView } from './PlanningItem.ts';
import type { Interval } from '../services/scheduler.ts';

/**
 * Une journée du planning, telle que l'écran la dessine : les plages où l'on travaille,
 * ce qui les occupe déjà, et ce qu'on a posé dedans.
 */
export interface PlanningDay {
  date: IsoDate;
  /** 0 = lundi. */
  weekday: number;
  /** Plages travaillables de ce jour, avant occupation. */
  windows: Interval[];
  /** Créneaux de travail, suggestions et approuvés confondus. */
  slots: ProductionSlotView[];
  /** Événements de l'agenda externe. Lecture seule : on ne les touche jamais. */
  events: CalendarEvent[];
  /** Minutes de travail suggérées et pas encore approuvées. */
  suggestedMinutes: number;
  /** Minutes approuvées : du temps réellement passé. */
  approvedMinutes: number;
}

/**
 * Tout l'écran de planning en une requête.
 *
 * Les jours, la pile de travail et l'état de la connexion à l'agenda arrivent ensemble :
 * dessiner une grille horaire demande les trois, et trois requêtes feraient apparaître
 * la grille avant ce qui la remplit.
 */
export interface PlanningBoard {
  from: IsoDate;
  to: IsoDate;
  days: PlanningDay[];
  /** La pile de ce qui reste à faire, dans l'ordre voulu. */
  items: PlanningItemView[];
  /** `false` tant qu'aucune instance n'est configurée : le planning marche sans. */
  calendarConnected: boolean;
  /** Message d'erreur de la dernière lecture d'agenda, `null` si tout va bien. */
  calendarError: string | null;
  /** Aucune plage travaillable configurée : le moteur n'a nulle part où poser. */
  hasWorkHours: boolean;
}
