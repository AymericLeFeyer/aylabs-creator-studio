import { request } from '../../http/httpClient.ts';
import type {
  Production,
  ProductionInput,
  ProductionStatus,
} from '../../../domain/production/entities/Production.ts';
import type { ProductionOverview } from '../../../domain/production/entities/ProductionOverview.ts';
import type {
  ProductionSlot,
  ProductionSlotInput,
} from '../../../domain/production/entities/ProductionSlot.ts';
import type {
  ProductionStep,
  ProductionStepInput,
} from '../../../domain/production/entities/ProductionStep.ts';
import type {
  StepTodo,
  StepTodoInput,
  TodoItem,
} from '../../../domain/production/entities/StepTodo.ts';
import type { TimeEntry, TimeEntryInput } from '../../../domain/production/entities/TimeEntry.ts';

export interface ProductionListParams {
  statuses?: ProductionStatus[];
  channelIds?: string[];
  from?: string;
  to?: string;
  search?: string;
}

export interface SlotListParams {
  productionIds?: string[];
  from?: string;
  to?: string;
  includeDone?: boolean;
}

const csv = (values?: string[]): string | undefined =>
  values && values.length > 0 ? values.join(',') : undefined;

export const productionApi = {
  list: (params: ProductionListParams = {}) =>
    request<Production[]>('/api/productions', {
      query: {
        statuses: csv(params.statuses),
        channelIds: csv(params.channelIds),
        from: params.from,
        to: params.to,
        search: params.search || undefined,
      },
    }),

  get: (id: string) => request<Production>(`/api/productions/${id}`),

  overview: () => request<ProductionOverview>('/api/productions/overview'),

  create: (input: ProductionInput) =>
    request<Production>('/api/productions', { method: 'POST', body: input }),

  update: (id: string, input: Partial<ProductionInput>) =>
    request<Production>(`/api/productions/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/productions/${id}`, { method: 'DELETE' }),

  /** L'ordre complet de la file : le rang est la position dans le tableau envoyé. */
  reorder: (ids: string[]) =>
    request<void>('/api/productions/reorder', { method: 'POST', body: { ids } }),

  publish: (id: string, videoId: string) =>
    request<Production>(`/api/productions/${id}/publish`, { method: 'POST', body: { videoId } }),

  checkStep: (id: string, stepId: string) =>
    request<void>(`/api/productions/${id}/steps/${stepId}`, { method: 'PUT' }),

  uncheckStep: (id: string, stepId: string) =>
    request<void>(`/api/productions/${id}/steps/${stepId}`, { method: 'DELETE' }),
};

export const productionStepApi = {
  list: (includeArchived = false) =>
    request<ProductionStep[]>('/api/production-steps', { query: { includeArchived } }),

  create: (input: ProductionStepInput) =>
    request<ProductionStep>('/api/production-steps', { method: 'POST', body: input }),

  update: (id: string, input: Partial<ProductionStepInput>) =>
    request<ProductionStep>(`/api/production-steps/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/production-steps/${id}`, { method: 'DELETE' }),
};

export const productionSlotApi = {
  list: (params: SlotListParams = {}) =>
    request<ProductionSlot[]>('/api/production-slots', {
      query: {
        productionIds: csv(params.productionIds),
        from: params.from,
        to: params.to,
        includeDone: params.includeDone,
      },
    }),

  create: (input: ProductionSlotInput) =>
    request<ProductionSlot>('/api/production-slots', { method: 'POST', body: input }),

  update: (id: string, input: Partial<Omit<ProductionSlotInput, 'productionId'>>) =>
    request<ProductionSlot>(`/api/production-slots/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/production-slots/${id}`, { method: 'DELETE' }),
};

/** Le référentiel des tâches : ce qu'il y a à faire dans une étape, pour toutes les vidéos. */
export const stepTodoApi = {
  list: (includeArchived = false) =>
    request<StepTodo[]>('/api/step-todos', { query: { includeArchived } }),

  create: (input: StepTodoInput) =>
    request<StepTodo>('/api/step-todos', { method: 'POST', body: input }),

  update: (id: string, input: Partial<Omit<StepTodoInput, 'stepId'>>) =>
    request<StepTodo>(`/api/step-todos/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/step-todos/${id}`, { method: 'DELETE' }),
};

/**
 * Les tâches d'une vidéo. Chaque écriture renvoie la **liste complète** plutôt qu'un
 * accusé : cocher une tâche peut cocher son étape, et le front doit repartir de l'état
 * que l'API vient de décider, pas d'une déduction locale.
 */
export const productionTodoApi = {
  list: (productionId: string) => request<TodoItem[]>(`/api/productions/${productionId}/todos`),

  add: (productionId: string, label: string, stepId: string | null) =>
    request<TodoItem[]>(`/api/productions/${productionId}/todos`, {
      method: 'POST',
      body: { label, stepId },
    }),

  toggle: (productionId: string, todoId: string, checked: boolean) =>
    request<TodoItem[]>(`/api/productions/${productionId}/todos/${todoId}`, {
      method: 'PUT',
      body: { checked },
    }),

  remove: (productionId: string, todoId: string) =>
    request<void>(`/api/productions/${productionId}/todos/${todoId}`, { method: 'DELETE' }),
};

export interface TimeListParams {
  productionIds?: string[];
  from?: string;
  to?: string;
}

export const productionTimeApi = {
  list: (params: TimeListParams = {}) =>
    request<TimeEntry[]>('/api/production-time', {
      query: {
        productionIds: csv(params.productionIds),
        from: params.from,
        to: params.to,
      },
    }),

  running: () => request<TimeEntry | null>('/api/production-time/running'),

  /** Démarre un chronomètre. Celui qui tournait, s'il y en avait un, est arrêté. */
  start: (productionId: string, stepId: string | null) =>
    request<TimeEntry>('/api/production-time/start', {
      method: 'POST',
      body: { productionId, stepId },
    }),

  stop: (id: string) => request<TimeEntry>(`/api/production-time/${id}/stop`, { method: 'POST' }),

  /** Saisie manuelle : un début et une durée, jamais une fin. */
  create: (input: TimeEntryInput) =>
    request<TimeEntry>('/api/production-time', { method: 'POST', body: input }),

  update: (id: string, input: Partial<Omit<TimeEntryInput, 'productionId'>>) =>
    request<TimeEntry>(`/api/production-time/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/production-time/${id}`, { method: 'DELETE' }),
};
