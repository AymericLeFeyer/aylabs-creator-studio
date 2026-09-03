import type { IsoDate } from '../../../shared/dates.ts';
import type { ProductionView } from './Production.ts';
import type { ProductionSlotView } from './ProductionSlot.ts';
import type { TimeEntryView } from './TimeEntry.ts';

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

/**
 * Les chiffres du bandeau de l'écran de production.
 *
 * Ce sont des **états de file**, pas des flux : aucun ne dépend d'une période, et
 * l'écran de production n'en porte d'ailleurs pas. La seule fenêtre de temps qui y a un
 * sens est la semaine — ce sur quoi on peut encore agir.
 */
export interface ProductionStats {
  /** Vidéos pas encore publiées, tous statuts de travail confondus. */
  inQueue: number;
  inProgress: number;
  /** Bloquées par quelqu'un d'autre : c'est le chiffre qui appelle une relance. */
  paused: number;
  /** Sorties visées dans les 7 prochains jours. */
  dueThisWeek: number;
  /** Sorties visées déjà dépassées, hors vidéos terminées. */
  late: number;
  /** Prochaine sortie visée, `null` si plus rien n'est daté. */
  nextRelease: { id: string; title: string; date: IsoDate } | null;
  /** Temps déjà enregistré sur les 7 derniers jours, chronomètre en cours compris. */
  weekTrackedMinutes: number;
  /** Part moyenne d'étapes et de tâches cochées dans la file, entre 0 et 1. */
  averageProgress: number;
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
  /** Les chiffres du bandeau. */
  stats: ProductionStats;
  /**
   * Le chronomètre en cours, s'il y en a un. Il vit dans l'aperçu et non dans un appel
   * séparé : la barre qui l'affiche est en haut de l'écran de production, chargé par
   * cette même requête.
   */
  running: TimeEntryView | null;
}
