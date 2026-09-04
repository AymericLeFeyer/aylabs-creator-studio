import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Un événement lu dans l'agenda externe.
 *
 * Les heures sont des **minutes depuis minuit dans le fuseau du calendrier**, extraites
 * telles quelles de la chaîne renvoyée par Home Assistant (`2026-09-04T14:00:00+02:00`
 * donne 14 h 00). C'est volontaire : les recomposer avec l'horloge du serveur décalerait
 * toute la journée de deux heures, l'API tournant en UTC dans un conteneur. L'heure
 * qu'on lit est celle que l'utilisateur voit dans son agenda, point.
 */
export interface CalendarEvent {
  uid: string;
  calendarId: string;
  summary: string;
  date: IsoDate;
  /** `null` sur un événement d'une journée entière : il n'occupe aucune heure précise. */
  start: number | null;
  end: number | null;
  allDay: boolean;
}

/** Une entité calendrier proposée par l'instance Home Assistant. */
export interface CalendarRef {
  id: string;
  name: string;
}
