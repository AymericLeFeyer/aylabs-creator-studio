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

/** Rapprochement proposé entre une production et une sortie déjà collectée. */
export interface PublishSuggestion {
  productionId: string;
  productionTitle: string;
  videoId: string;
  videoTitle: string;
  videoDate: string;
  dayGap: number;
}

export interface ProductionOverview {
  queue: Production[];
  /** La prochaine à travailler : la première de la file qui n'est pas en pause. */
  nextId: string | null;
  alerts: ProductionAlert[];
  suggestions: PublishSuggestion[];
  upcomingSlots: ProductionSlot[];
  weekLoadMinutes: number;
}
