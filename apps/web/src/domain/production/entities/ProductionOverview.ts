/** Contrat de `/api/productions/overview`. */

import type { Production, ProductionFormat } from './Production.ts';
import type { ProductionSlot } from './ProductionSlot.ts';
import type { TimeEntry } from './TimeEntry.ts';

/** Les chiffres du bandeau de l'écran de production. Des états de file, pas des flux. */
export interface ProductionStats {
  inQueue: number;
  inProgress: number;
  paused: number;
  dueThisWeek: number;
  late: number;
  nextRelease: { id: string; title: string; date: string } | null;
  /** Temps enregistré sur les 7 derniers jours, chronomètre en cours compris. */
  weekTrackedMinutes: number;
  /** Part moyenne d'étapes et de tâches cochées dans la file, entre 0 et 1. */
  averageProgress: number;
}

export type ProductionAlertKind =
  | 'product_late'
  | 'sponsorship_due'
  | 'sponsorship_undelivered'
  /** Vidéo livrée, argent dû : une relance à faire. */
  | 'sponsorship_awaiting_payment'
  | 'production_stalled'
  /** Sortie dans moins d'une semaine, pas commencée ou en pause. */
  | 'production_urgent'
  /** Publiée alors qu'il restait des tâches non cochées. */
  | 'production_incomplete';

export interface ProductionAlert {
  kind: ProductionAlertKind;
  severity: 'danger' | 'warning';
  title: string;
  detail: string;
  date: string | null;
  productionId: string | null;
  /** Format de la production concernée : range l'alerte dans le bon menu. */
  productionFormat: ProductionFormat | null;
  productId: string | null;
  sponsorshipId: string | null;
}

/**
 * Temps moyen d'une étape sur une vidéo. Ne compte que les vidéos où l'étape est
 * terminée (cochée, ou vidéo publiée), et seulement le temps vécu (sessions de travail).
 */
export interface StepTimeAverage {
  stepId: string;
  stepName: string;
  stepColor: string;
  averageMinutes: number;
  /** Nombre de vidéos sur lesquelles la moyenne est calculée. */
  videos: number;
}

export interface ProductionOverview {
  queue: Production[];
  /** La prochaine à travailler : la première de la file qui n'est pas en pause. */
  nextId: string | null;
  alerts: ProductionAlert[];
  upcomingSlots: ProductionSlot[];
  weekLoadMinutes: number;
  stats: ProductionStats;
  /** Temps moyen par étape, borné au format. Étapes jamais mesurées absentes. */
  stepAverages: StepTimeAverage[];
  /** Temps total moyen d'une vidéo publiée, `null` sans aucune publiée mesurée. */
  averageVideoMinutes: { minutes: number; videos: number } | null;
  /** Le chronomètre en cours, `null` s'il n'y en a pas. */
  running: TimeEntry | null;
}
