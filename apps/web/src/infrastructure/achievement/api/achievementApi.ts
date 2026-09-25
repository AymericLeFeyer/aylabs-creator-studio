import { request } from '../../http/httpClient.ts';
import type { AchievementsView } from '../../../domain/achievement/entities/Achievement.ts';

export const achievementApi = {
  list: () => request<AchievementsView>('/api/achievements'),
};
