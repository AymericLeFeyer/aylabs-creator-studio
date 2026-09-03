import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Une session de travail sur une vidéo.
 *
 * `endedAt` à `null` signifie **le chronomètre tourne encore**. C'est l'état qui vit en
 * base plutôt que dans le navigateur : fermer l'onglet, changer de machine ou recharger
 * la page ne doit pas perdre le temps déjà écoulé.
 *
 * `minutes` est **figé à l'arrêt** et non recalculé à chaque lecture : une saisie
 * manuelle (« j'ai monté 2 h hier soir ») n'a pas d'horodatage fiable à soustraire, et
 * corriger une durée après coup ne doit pas déplacer l'heure de début.
 */
export interface TimeEntry {
  id: string;
  productionId: string;
  /** Étape travaillée. `null` = temps non qualifié. */
  stepId: string | null;
  /** Horodatage ISO complet du début. */
  startedAt: string;
  /** `null` tant que la session est en cours. */
  endedAt: string | null;
  /** Durée retenue, en minutes. `null` tant que le chronomètre tourne. */
  minutes: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Session enrichie de ce qu'il faut pour l'afficher hors de sa fiche. */
export interface TimeEntryView extends TimeEntry {
  productionTitle: string;
  channelId: string | null;
  channelColor: string | null;
  stepName: string | null;
  stepColor: string | null;
  /** Jour de rattachement (celui du début), pour les cumuls par semaine. */
  date: IsoDate;
}

export interface CreateTimeEntryInput {
  productionId: string;
  stepId?: string | null;
  startedAt: string;
  endedAt?: string | null;
  minutes?: number | null;
  notes?: string | null;
}

export type UpdateTimeEntryInput = Partial<Omit<CreateTimeEntryInput, 'productionId'>>;

/**
 * Durée d'une session, en minutes.
 * Une session en cours se mesure jusqu'à maintenant : c'est la seule façon d'afficher
 * un cumul de la semaine qui inclut le chronomètre en train de tourner.
 */
export const entryMinutes = (entry: TimeEntry, now = Date.now()): number => {
  if (entry.minutes !== null) return entry.minutes;
  const started = Date.parse(entry.startedAt);
  if (Number.isNaN(started)) return 0;
  return Math.max(0, Math.round((now - started) / 60_000));
};
