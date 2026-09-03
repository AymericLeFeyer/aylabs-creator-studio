/** Contrat de `/api/productions/overview`. */

import type { Production } from './Production.ts';
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
  'product_late' | 'sponsorship_due' | 'sponsorship_undelivered' | 'production_stalled';

export interface ProductionAlert {
  kind: ProductionAlertKind;
  severity: 'danger' | 'warning';
  title: string;
  detail: string;
  date: string | null;
  productionId: string | null;
  productId: string | null;
  sponsorshipId: string | null;
}

export interface ProductionOverview {
  queue: Production[];
  /** La prochaine à travailler : la première de la file qui n'est pas en pause. */
  nextId: string | null;
  alerts: ProductionAlert[];
  upcomingSlots: ProductionSlot[];
  weekLoadMinutes: number;
  stats: ProductionStats;
  /** Le chronomètre en cours, `null` s'il n'y en a pas. */
  running: TimeEntry | null;
}
