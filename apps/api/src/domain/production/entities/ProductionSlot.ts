import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Qui a posé ce créneau.
 *
 * C'est ce qui décide si le moteur de placement a le droit d'y toucher : il ne déplace
 * **que** les créneaux `planner` encore non faits. Un créneau posé à la main a été voulu
 * là où il est, et un créneau approuvé raconte du temps déjà passé.
 */
export type SlotOrigin = 'manual' | 'planner';

/**
 * Un créneau de travail posé sur une vidéo : « samedi 14h-17h, montage ».
 *
 * Les heures sont **facultatives** : « samedi » est un créneau parfaitement valable,
 * et exiger un horaire ferait renoncer à en poser un. Quand elles sont là, elles
 * servent à calculer la charge de travail planifiée de la semaine.
 *
 * Il n'y a **pas de colonne `status`** : `origin` dit qui l'a posé et `done` dit s'il
 * est passé. Un troisième champ redirait la même chose et finirait par la contredire —
 * « suggéré » n'est rien d'autre que `planner` et pas encore `done`.
 */
export interface ProductionSlot {
  id: string;
  productionId: string;
  /** Étape visée par ce créneau. `null` = travail non qualifié. */
  stepId: string | null;
  date: IsoDate;
  /** Format `HH:MM`, ou `null`. */
  startTime: string | null;
  endTime: string | null;
  label: string;
  /** Approuvé : ce temps a été passé. Un créneau `done` ne se déplace plus jamais. */
  done: boolean;
  notes: string | null;
  origin: SlotOrigin;
  /** Ligne de la pile de travail que ce créneau sert à couvrir. */
  itemId: string | null;
  /** Trace de publication dans l'agenda. Sa présence vaut « déjà poussé ». */
  calendarUid: string | null;
  /** Session de travail créée à l'approbation, pour pouvoir la défaire. */
  timeEntryId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Créneau enrichi de sa production, pour l'affichage du planning global. */
export interface ProductionSlotView extends ProductionSlot {
  productionTitle: string;
  channelId: string | null;
  channelColor: string | null;
  stepName: string | null;
  stepColor: string | null;
}

export interface CreateProductionSlotInput {
  productionId: string;
  stepId?: string | null;
  date: IsoDate;
  startTime?: string | null;
  endTime?: string | null;
  label?: string;
  done?: boolean;
  notes?: string | null;
  origin?: SlotOrigin;
  itemId?: string | null;
}

export type UpdateProductionSlotInput = Partial<Omit<CreateProductionSlotInput, 'productionId'>> & {
  calendarUid?: string | null;
  timeEntryId?: string | null;
};

/**
 * Durée d'un créneau en minutes, `0` si les heures manquent.
 * Un créneau sans horaire ne compte pas dans la charge : mieux vaut sous-estimer que
 * d'inventer une durée par défaut qui fausserait le total de la semaine.
 */
export const slotMinutes = (slot: Pick<ProductionSlot, 'startTime' | 'endTime'>): number => {
  if (!slot.startTime || !slot.endTime) return 0;
  const toMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours ?? 0) * 60 + (minutes ?? 0);
  };
  const duration = toMinutes(slot.endTime) - toMinutes(slot.startTime);
  return duration > 0 ? duration : 0;
};
