import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Un créneau de travail posé sur une vidéo : « samedi 14h-17h, montage ».
 *
 * Les heures sont **facultatives** : « samedi » est un créneau parfaitement valable,
 * et exiger un horaire ferait renoncer à en poser un. Quand elles sont là, elles
 * servent à calculer la charge de travail planifiée de la semaine.
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
  done: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Créneau enrichi de sa production, pour l'affichage du planning global. */
export interface ProductionSlotView extends ProductionSlot {
  productionTitle: string;
  channelId: string | null;
  channelColor: string | null;
  stepName: string | null;
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
}

export type UpdateProductionSlotInput = Partial<Omit<CreateProductionSlotInput, 'productionId'>>;

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
