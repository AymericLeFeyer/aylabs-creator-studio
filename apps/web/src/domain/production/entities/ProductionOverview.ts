/** Contrat de `/api/productions/overview`. */

import type { Production } from './Production.ts';
import type { ProductionSlot } from './ProductionSlot.ts';

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
}
