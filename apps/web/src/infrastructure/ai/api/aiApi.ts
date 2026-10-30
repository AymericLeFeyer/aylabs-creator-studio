import { request } from '../../http/httpClient.ts';
import type { AiSettingsInput, AiSettingsView } from '../../../domain/ai/entities/Ai.ts';

export const aiApi = {
  settings: () => request<AiSettingsView>('/api/ai/settings'),
  update: (input: AiSettingsInput) =>
    request<AiSettingsView>('/api/ai/settings', { method: 'PATCH', body: input }),
};
