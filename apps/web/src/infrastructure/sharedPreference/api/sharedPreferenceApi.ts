import { request } from '../../http/httpClient.ts';

/** `/api/preferences` : des valeurs JSON libres, rangées par clé. L'API n'en connaît pas la forme. */
export const sharedPreferenceApi = {
  list: () => request<Record<string, unknown>>('/api/preferences'),

  set: (key: string, value: unknown) =>
    request<Record<string, unknown>>(`/api/preferences/${encodeURIComponent(key)}`, {
      method: 'PUT',
      body: { value },
    }),
};
