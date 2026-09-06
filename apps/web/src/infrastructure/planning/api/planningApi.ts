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
import type { TimeEntry } from '../../../domain/production/entities/TimeEntry.ts';

export interface ReplanInput {
  from?: string;
  /** Ne réorganiser qu'un jour : le bouton d'une colonne. */
  onlyDate?: string;
  /** Le jour qu'il est ici. Sans lui, le serveur — en UTC — planifierait dans le passé. */
  nowDate?: string;
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

  removeItem: (id: string) => request<void>(`/api/planning/items/${id}`, { method: 'DELETE' }),

  /**
   * Vide la pile : tout ce qui est encore à faire s'en va, avec ses créneaux non vécus.
   * Les créneaux **approuvés** restent — ils racontent du temps réellement passé.
   */
  clearItems: () => request<{ removed: number }>('/api/planning/items', { method: 'DELETE' }),

  /**
   * Pose un créneau à la main sur une ligne de la pile : le glisser-déposer depuis la
   * colonne « En cours » vers la grille. Le créneau naît `manual`, donc immobile.
   */
  placeItem: (input: { itemId: string; date: string; startTime: string; minutes?: number }) =>
    request<ProductionSlot>('/api/planning/slots', { method: 'POST', body: input }),

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

  /**
   * Démarre le chronomètre sur un créneau. À l'arrêt, le créneau sera recalé sur les
   * horaires réellement passés.
   */
  startTimerOnSlot: (slotId: string, date: string, startTime: string) =>
    request<TimeEntry>(`/api/planning/slots/${slotId}/start-timer`, {
      method: 'POST',
      body: { date, startTime },
    }),

  /**
   * Transforme une session de travail en créneau approuvé.
   *
   * `date` et `startTime` sont calculés **par le navigateur** : `startedAt` est un
   * horodatage UTC, et le serveur l'est aussi — les recalculer là-bas poserait le créneau
   * deux heures trop tôt en été.
   */
  slotFromTimeEntry: (
    timeEntryId: string,
    date: string,
    startTime: string,
    now: { nowDate: string; nowMinutes: number },
  ) =>
    request<ProductionSlot>(`/api/planning/time-entries/${timeEntryId}/slot`, {
      method: 'POST',
      body: { date, startTime, ...now },
    }),

  unapprove: (slotId: string) =>
    request<void>(`/api/planning/slots/${slotId}/unapprove`, { method: 'POST' }),
};
