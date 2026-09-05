/** Contrat de `/api/production-time`. */

/**
 * Du travail que l'on vient de mesurer et **qui peut être déclaré terminé**.
 *
 * Rendu par l'arrêt du chronomètre, `null` quand la session ne couvrait aucune ligne de
 * la pile du planning — un chronomètre lancé depuis une fiche de vidéo, par exemple : il
 * n'y a alors rien à fermer, et poser la question n'aurait aucun objet.
 */
export interface CompletableWork {
  itemId: string;
  productionId: string;
  /** La tâche à cocher. `null` quand la ligne couvre l'étape entière. */
  todoId: string | null;
  /** L'étape à cocher, quand il n'y a pas de tâche plus fine à viser. */
  stepId: string | null;
  label: string;
}

/** Ce que rend l'arrêt d'un chronomètre : la session, et de quoi proposer de la clore. */
export interface StopTimerResult {
  entry: TimeEntry;
  completable: CompletableWork | null;
}

export interface TimeEntry {
  id: string;
  productionId: string;
  stepId: string | null;
  /**
   * Sous-étape travaillée. `null` = l'étape suffit à dire ce qu'on faisait.
   *
   * C'est la maille sur laquelle le planning réserve du temps : la renseigner est la
   * seule façon de comparer ce qu'on avait estimé à ce qu'on a vécu.
   */
  todoId: string | null;
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
  /** Libellé de la sous-étape, `null` si elle n'existe plus ou n'a jamais été posée. */
  todoLabel: string | null;
  /** Créneau de planning déjà tiré de cette session : sa présence interdit d'en tirer un second. */
  slotId: string | null;
  /** Jour de rattachement : celui du début. */
  date: string;
}

export interface TimeEntryInput {
  productionId: string;
  stepId?: string | null;
  todoId?: string | null;
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
