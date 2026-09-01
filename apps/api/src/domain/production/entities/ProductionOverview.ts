import type { IsoDate } from '../../../shared/dates.ts';
import type { ProductionView } from './Production.ts';
import type { ProductionSlotView } from './ProductionSlot.ts';

/**
 * Nature d'une alerte. Le type est explicite plutôt qu'un simple message : le front
 * choisit l'icône et le lien de destination sans avoir à relire le texte.
 */
export type ProductionAlertKind =
  'product_late' | 'sponsorship_due' | 'sponsorship_undelivered' | 'production_stalled';

export interface ProductionAlert {
  kind: ProductionAlertKind;
  /** `danger` = l'échéance est déjà passée ; `warning` = elle approche. */
  severity: 'danger' | 'warning';
  title: string;
  detail: string;
  /** Date concernée (échéance, mise en pause…), pour l'afficher telle quelle. */
  date: IsoDate | null;
  productionId: string | null;
  productId: string | null;
  sponsorshipId: string | null;
}

/** Tout ce que l'écran de production affiche en tête : « où j'en suis », en une requête. */
export interface ProductionOverview {
  /** Vidéos encore à faire, dans l'ordre manuel. */
  queue: ProductionView[];
  /** La prochaine à travailler : la première de la file qui n'est pas en pause. */
  nextId: string | null;
  alerts: ProductionAlert[];
  /** Créneaux des 14 prochains jours, tous projets confondus. */
  upcomingSlots: ProductionSlotView[];
  /** Charge planifiée des 7 prochains jours, en minutes (créneaux sans horaire exclus). */
  weekLoadMinutes: number;
}
