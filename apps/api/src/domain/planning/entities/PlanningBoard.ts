import type { IsoDate } from '../../../shared/dates.ts';
import type { ProductionStatus } from '../../production/entities/Production.ts';
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
 * La fenêtre de travail d'une vidéo, projetée sur la grille : de quand à quand cette
 * vidéo occupe le calendrier.
 *
 * Elle ne se déduit pas des créneaux : une vidéo peut avoir une période annoncée sans
 * qu'aucune heure n'ait encore été posée, et c'est justement ce qu'on veut voir. Les
 * bornes sont **celles de la production** (`startDate` → `plannedDate`) et non celles de
 * la période affichée : le front sait ainsi quel côté déborde du cadre, et le dit.
 */
export interface PlanningProductionSpan {
  id: string;
  title: string;
  status: ProductionStatus;
  channelName: string | null;
  channelColor: string | null;
  /** Premier jour de la fenêtre. Vaut `plannedDate` quand aucun début n'est posé. */
  from: IsoDate;
  /** Dernier jour. Vaut `startDate` quand aucune sortie n'est visée. */
  to: IsoDate;
  /** Le jour de sortie visé, s'il est posé : c'est lui qui porte l'échéance. */
  plannedDate: IsoDate | null;
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
  /**
   * Les fenêtres de travail des vidéos qui recoupent la période, la plus tôt d'abord.
   * Elles se dessinent en swimlane au-dessus de la grille : « sur quoi suis-je censé
   * travailler ces jours-ci » se lit avant le détail des heures.
   */
  productions: PlanningProductionSpan[];
  /** `false` tant qu'aucune instance n'est configurée : le planning marche sans. */
  calendarConnected: boolean;
  /** Message d'erreur de la dernière lecture d'agenda, `null` si tout va bien. */
  calendarError: string | null;
  /** Aucune plage travaillable configurée : le moteur n'a nulle part où poser. */
  hasWorkHours: boolean;
}
