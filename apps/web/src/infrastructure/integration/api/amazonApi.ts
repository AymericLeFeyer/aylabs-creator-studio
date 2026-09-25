import { request } from '../../http/httpClient.ts';
import type { AmazonOverview } from '../../../domain/integration/entities/AmazonOverview.ts';

export interface AmazonOverviewParams {
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
}

export const amazonApi = {
  overview: (params: AmazonOverviewParams) =>
    request<AmazonOverview>('/api/amazon/overview', { query: { ...params } }),
};
