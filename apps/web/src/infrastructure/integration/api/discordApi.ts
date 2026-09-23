import { request } from '../../http/httpClient.ts';
import type { DiscordSnapshot } from '../../../domain/integration/entities/DiscordHistory.ts';

export interface DiscordHistoryParams {
  from: string;
  to: string;
}

export const discordApi = {
  history: (params: DiscordHistoryParams) =>
    request<DiscordSnapshot[]>('/api/discord/history', { query: { ...params } }),
};
