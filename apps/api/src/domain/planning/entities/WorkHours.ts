/**
 * Les plages travaillables d'une semaine type.
 *
 * **Plusieurs lignes par jour**, volontairement : une journée coupée par la pause du
 * midi est le cas normal, et une seule plage par jour ferait poser un créneau de
 * montage à 12 h 30. Un jour sans aucune ligne n'est simplement pas travaillé — c'est
 * ce qui remplace un « actif oui/non » qui n'aurait rien dit de plus.
 *
 * `weekday` suit la convention du reste de l'outil : **0 = lundi**, comme
 * `bucketStart` en granularité `week`.
 */
export interface WorkHours {
  id: string;
  weekday: number;
  /** Format `HH:MM`. */
  startTime: string;
  endTime: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkHoursInput {
  weekday: number;
  startTime: string;
  endTime: string;
}

/** Libellés dans l'ordre de la semaine, pour l'écran de réglages et le planning. */
export const WEEKDAY_LABELS = [
  'Lundi',
  'Mardi',
  'Mercredi',
  'Jeudi',
  'Vendredi',
  'Samedi',
  'Dimanche',
] as const;

/** Minutes depuis minuit. `HH:MM` est le seul format stocké. */
export const toMinutes = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

export const toTime = (minutes: number): string => {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
