/**
 * Contrat de `/api/live-ideas`. Reflète `apps/api/src/domain/live/entities/LiveIdea.ts`.
 */
export interface LiveIdea {
  id: string;
  title: string;
  notes: string;
  /** `null` : une idée sans jour, hors du planning. */
  plannedDate: string | null;
  /** `HH:MM` locale. `null` : le jour seul, le live n'occupe aucune plage. */
  startTime: string | null;
  durationMinutes: number;
  channelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LiveIdeaInput {
  title: string;
  notes?: string;
  plannedDate?: string | null;
  startTime?: string | null;
  durationMinutes?: number;
}

export const DEFAULT_LIVE_MINUTES = 120;
