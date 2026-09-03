/** Contrat de `/api/production-time`. */

export interface TimeEntry {
  id: string;
  productionId: string;
  stepId: string | null;
  startedAt: string;
  /** `null` = le chronomètre tourne encore. */
  endedAt: string | null;
  /** Durée figée à l'arrêt, en minutes. `null` tant que la session est en cours. */
  minutes: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;

  productionTitle: string;
  channelId: string | null;
  channelColor: string | null;
  stepName: string | null;
  stepColor: string | null;
  /** Jour de rattachement : celui du début. */
  date: string;
}

export interface TimeEntryInput {
  productionId: string;
  stepId?: string | null;
  startedAt: string;
  minutes: number;
  notes?: string | null;
}

/**
 * Durée d'une session, en minutes. Dupliqué à l'identique côté API : une session en
 * cours se mesure jusqu'à maintenant, sinon le compteur resterait figé pendant qu'on
 * travaille — exactement au moment où on le regarde.
 */
export const entryMinutes = (entry: TimeEntry, now = Date.now()): number => {
  if (entry.minutes !== null) return entry.minutes;
  const started = Date.parse(entry.startedAt);
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.round((now - started) / 60_000));
};

/** « 4 h 30 », « 45 min » — une durée de travail ne se lit pas en minutes au-delà d'une heure. */
export const formatDuration = (minutes: number): string => {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`;
};

/** « 01:23:45 » — le format d'un chronomètre qui tourne, lu à la seconde. */
export const formatStopwatch = (milliseconds: number): string => {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};
