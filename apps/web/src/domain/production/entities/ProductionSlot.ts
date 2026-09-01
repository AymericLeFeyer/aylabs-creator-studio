/** Contrat de `/api/production-slots`. */

export interface ProductionSlot {
  id: string;
  productionId: string;
  stepId: string | null;
  date: string;
  /** Format `HH:MM`, ou `null` : un créneau sans horaire reste un créneau. */
  startTime: string | null;
  endTime: string | null;
  label: string;
  done: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;

  productionTitle: string;
  channelId: string | null;
  channelColor: string | null;
  stepName: string | null;
}

export interface ProductionSlotInput {
  productionId: string;
  stepId?: string | null;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  label?: string;
  done?: boolean;
  notes?: string | null;
}

/**
 * Durée en minutes, `0` sans horaire complet — même règle que côté API : mieux vaut
 * sous-estimer la charge que d'inventer une durée par défaut.
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

/** « 14:00 – 17:00 », « 14:00 », ou « toute la journée ». */
export const formatSlotTime = (slot: ProductionSlot): string => {
  if (!slot.startTime) return 'toute la journée';
  return slot.endTime ? `${slot.startTime} – ${slot.endTime}` : slot.startTime;
};
