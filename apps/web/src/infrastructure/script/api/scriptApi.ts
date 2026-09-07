import { request } from '../../http/httpClient.ts';
import type {
  ScriptPreset,
  ScriptPresetInput,
} from '../../../domain/script/entities/ScriptPreset.ts';
import type {
  ShotAngle,
  ShotAngleInput,
  ShotAngleItem,
} from '../../../domain/script/entities/ShotAngle.ts';

/** Les gabarits insérables dans un script. */
export const scriptPresetApi = {
  list: (includeArchived = false) =>
    request<ScriptPreset[]>('/api/script-presets', { query: { includeArchived } }),

  create: (input: ScriptPresetInput) =>
    request<ScriptPreset>('/api/script-presets', { method: 'POST', body: input }),

  update: (id: string, input: Partial<ScriptPresetInput> & { isArchived?: boolean }) =>
    request<ScriptPreset>(`/api/script-presets/${id}`, { method: 'PATCH', body: input }),

  reorder: (ids: string[]) =>
    request<void>('/api/script-presets/reorder', { method: 'POST', body: { ids } }),

  remove: (id: string) => request<void>(`/api/script-presets/${id}`, { method: 'DELETE' }),
};

/** Le référentiel des angles de vue : ceux qu'on utilise sur toutes les vidéos. */
export const shotAngleApi = {
  list: (includeArchived = false) =>
    request<ShotAngle[]>('/api/shot-angles', { query: { includeArchived } }),

  create: (input: ShotAngleInput) =>
    request<ShotAngle>('/api/shot-angles', { method: 'POST', body: input }),

  update: (id: string, input: Partial<ShotAngleInput> & { isArchived?: boolean }) =>
    request<ShotAngle>(`/api/shot-angles/${id}`, { method: 'PATCH', body: input }),

  reorder: (ids: string[]) =>
    request<void>('/api/shot-angles/reorder', { method: 'POST', body: { ids } }),

  remove: (id: string) => request<void>(`/api/shot-angles/${id}`, { method: 'DELETE' }),
};

/**
 * Les angles proposés **sur une vidéo** : référentiel et ponctuels réunis.
 *
 * Chaque écriture renvoie la **liste complète** plutôt qu'un accusé, comme les tâches :
 * l'éditeur ne connaît qu'une liste, et la recomposer localement après un ajout ferait
 * diverger son ordre de celui du dépôt.
 */
export const productionShotAngleApi = {
  list: (productionId: string) =>
    request<ShotAngleItem[]>(`/api/productions/${productionId}/shot-angles`),

  create: (productionId: string, input: ShotAngleInput) =>
    request<ShotAngleItem[]>(`/api/productions/${productionId}/shot-angles`, {
      method: 'POST',
      body: input,
    }),

  update: (productionId: string, angleId: string, input: Partial<ShotAngleInput>) =>
    request<ShotAngleItem[]>(`/api/productions/${productionId}/shot-angles/${angleId}`, {
      method: 'PATCH',
      body: input,
    }),

  remove: (productionId: string, angleId: string) =>
    request<ShotAngleItem[]>(`/api/productions/${productionId}/shot-angles/${angleId}`, {
      method: 'DELETE',
    }),
};
