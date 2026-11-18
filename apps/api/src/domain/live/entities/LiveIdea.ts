import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Un live à faire : une idée, éventuellement datée.
 *
 * La date et l'heure sont **facultatives** : une idée se note avant d'avoir un jour, et
 * exiger une date ferait renoncer à la noter. Dès qu'elle en a une, elle apparaît dans le
 * planning ; avec une heure, elle y occupe sa plage (`durationMinutes`), sans quoi le
 * moteur y poserait un montage par-dessus. Sans heure, c'est une mention en tête de jour.
 */
export interface LiveIdea {
  id: string;
  title: string;
  notes: string;
  plannedDate: IsoDate | null;
  /** `HH:MM` locale, sans fuseau — comme les créneaux de travail. */
  startTime: string | null;
  durationMinutes: number;
  channelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLiveIdeaInput {
  title: string;
  notes?: string;
  plannedDate?: IsoDate | null;
  startTime?: string | null;
  durationMinutes?: number;
  channelId?: string | null;
}

export type UpdateLiveIdeaInput = Partial<CreateLiveIdeaInput>;
