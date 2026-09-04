import { request } from '../../http/httpClient.ts';
import type {
  ApproveSlotInput,
  CalendarRef,
  PlanningBoard,
  PlanningItem,
  PlanningSettings,
  PlanningSettingsInput,
  PlanTargetsInput,
  WorkHours,
  WorkHoursInput,
} from '../../../domain/planning/entities/Planning.ts';
import type { ProductionSlot } from '../../../domain/production/entities/ProductionSlot.ts';

export interface ReplanInput {
  from?: string;
  /** Ne réorganiser qu'un jour : le bouton d'une colonne. */
  onlyDate?: string;
  nowMinutes?: number;
}

export const planningApi = {
  board: (from: string, to: string) =>
    request<PlanningBoard>('/api/planning/board', { query: { from, to } }),

  settings: () => request<PlanningSettings>('/api/planning/settings'),

  updateSettings: (input: PlanningSettingsInput) =>
    request<PlanningSettings>('/api/planning/settings', { method: 'PATCH', body: input }),

  /** Les entités calendrier de l'instance Home Assistant. */
  calendars: () => request<CalendarRef[]>('/api/planning/calendars'),

  workHours: () => request<WorkHours[]>('/api/planning/work-hours'),

  /** Remplacement total : le formulaire envoie l'état complet de la semaine. */
  replaceWorkHours: (ranges: WorkHoursInput[]) =>
    request<WorkHours[]>('/api/planning/work-hours', { method: 'PUT', body: { ranges } }),

  items: () => request<PlanningItem[]>('/api/planning/items'),

  addTargets: (input: PlanTargetsInput) =>
    request<PlanningItem[]>('/api/planning/items', { method: 'POST', body: input }),

  reorderItems: (ids: string[], nowMinutes?: number) =>
    request<PlanningItem[]>('/api/planning/items/reorder', {
      method: 'POST',
      body: { ids, nowMinutes },
    }),

  removeItem: (id: string) => request<void>(`/api/planning/items/${id}`, { method: 'DELETE' }),

  replan: (input: ReplanInput = {}) =>
    request<{ placed: number; unplacedMinutes: number }>('/api/planning/replan', {
      method: 'POST',
      body: input,
    }),

  /**
   * Approuve un créneau. La réponse porte le créneau **reposé** quand le travail n'est
   * pas terminé : l'écran peut ainsi dire où il a atterri sans relire toute la grille.
   */
  approve: (slotId: string, input: ApproveSlotInput) =>
    request<{ next: ProductionSlot | null }>(`/api/planning/slots/${slotId}/approve`, {
      method: 'POST',
      body: input,
    }),

  unapprove: (slotId: string) =>
    request<void>(`/api/planning/slots/${slotId}/unapprove`, { method: 'POST' }),
};
