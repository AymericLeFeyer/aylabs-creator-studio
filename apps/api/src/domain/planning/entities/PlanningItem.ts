import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Une ligne de la **pile de travail** : « il reste à écrire l'accroche de cette vidéo ».
 *
 * C'est ce qui distingue *planifié* de *fait*. Ajouter une vidéo au planning en cochant
 * « Écriture » dépose une ligne par sous-étape ; le moteur les couvre de créneaux, et
 * cocher la tâche retire la ligne de la pile — **sans toucher aux créneaux déjà posés**,
 * qui racontent le temps réellement passé.
 *
 * `sequence` est l'ordre voulu, et il est respecté strictement : la deuxième tâche ne
 * commence pas avant que la première ait sa dose de créneaux. Planifier « montage »
 * avant « tournage » ne servirait à rien.
 */
export type PlanningItemStatus = 'pending' | 'done' | 'cancelled';

export interface PlanningItem {
  id: string;
  productionId: string;
  /** Étape visée. `null` = travail sur la vidéo sans étape identifiée. */
  stepId: string | null;
  /** Tâche visée, dans `step_todos` **ou** `production_todos`. `null` = l'étape entière. */
  todoId: string | null;
  label: string;
  plannedMinutes: number;
  sequence: number;
  status: PlanningItemStatus;
  createdAt: string;
  updatedAt: string;
}

/** Ligne enrichie de tout ce que le planning affiche sur un bloc. */
export interface PlanningItemView extends PlanningItem {
  productionTitle: string;
  channelId: string | null;
  channelColor: string | null;
  stepName: string | null;
  stepColor: string | null;
  /** Sortie visée par la vidéo, pour trier ce qui est urgent. */
  plannedDate: IsoDate | null;
  /** Minutes déjà couvertes par des créneaux **non approuvés** encore posés. */
  scheduledMinutes: number;
  /** Minutes déjà approuvées sur cette ligne : du travail réellement fait. */
  approvedMinutes: number;
}

export interface CreatePlanningItemInput {
  productionId: string;
  stepId: string | null;
  todoId: string | null;
  label: string;
  plannedMinutes: number;
  sequence?: number;
}
