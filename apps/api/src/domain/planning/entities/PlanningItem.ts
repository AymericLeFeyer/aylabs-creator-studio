import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Une ligne de la **pile de travail** : « il reste à écrire l'accroche de cette vidéo ».
 *
 * C'est ce qui distingue *planifié* de *fait*. Ajouter une vidéo au planning en cochant
 * « Écriture » dépose une ligne par sous-étape ; le moteur les couvre de créneaux, et
 * cocher la tâche retire la ligne de la pile — **sans toucher aux créneaux déjà posés**,
 * qui racontent le temps réellement passé.
 *
 * **L'ordre de travail se déduit, il ne se règle pas ici** : file d'attente des vidéos
 * d'abord (`productions.sort_order`), puis ordre des étapes, puis `sequence` — posé dans
 * l'ordre des tâches au moment de l'ajout. On finit une vidéo avant d'attaquer la
 * suivante, et le tournage avant le montage.
 *
 * Il est respecté **strictement** par le moteur : la deuxième ligne ne reçoit pas de
 * créneau avant que la première ait eu toutes ses minutes. Pour changer l'ordre, on
 * réordonne la file sur `/production` — un rang propre à la pile pouvait la contredire, et
 * deux ordres concurrents pour la même question finissent par se répondre différemment.
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
  /** Rang de la vidéo dans la file d'attente : c'est lui qui ordonne le travail. */
  productionOrder: number;
  /** Rang de l'étape dans le référentiel, second critère de tri. */
  stepOrder: number;
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

/** Les bornes de forme d'un créneau, prises dans les réglages du planning. */
export interface SlotSizing {
  minBlockMinutes: number;
  maxBlockMinutes: number;
  slotGranularityMinutes: number;
}

/**
 * Combien de temps réserver quand on pose soi-même un créneau sur une ligne de la pile.
 *
 * **Le reste à couvrir d'abord**, plafonné par `maxBlockMinutes` : on glisse une tâche
 * sur la grille pour lui donner le temps qui lui manque, pas pour redire une durée qu'on
 * a déjà estimée ailleurs.
 *
 * Quand il ne reste rien — la ligne est déjà entièrement couverte, ou on repose un
 * deuxième bloc sur la même tâche parce qu'elle ne se fera pas d'une traite — la durée
 * retombe sur `minBlockMinutes`. **Poser un bloc de plus doit rester possible** : c'est
 * le geste normal quand on étale un montage sur trois soirées, et refuser au motif que
 * le compte est bon obligerait à gonfler l'estimation pour contourner l'outil.
 *
 * Dupliquée à l'identique côté front (`defaultSlotMinutes`), comme `slotMinutes` : le
 * bloc fantôme qui suit le curseur doit faire exactement la taille du créneau qui sera
 * posé, sinon il saute de hauteur au relâchement.
 */
export const defaultSlotMinutes = (
  item: Pick<PlanningItemView, 'plannedMinutes' | 'scheduledMinutes' | 'approvedMinutes'>,
  sizing: SlotSizing,
): number => {
  const uncovered = item.plannedMinutes - item.approvedMinutes - item.scheduledMinutes;
  const base = uncovered > 0 ? uncovered : sizing.minBlockMinutes;
  return Math.max(
    sizing.slotGranularityMinutes,
    Math.min(sizing.maxBlockMinutes, Math.round(base)),
  );
};
