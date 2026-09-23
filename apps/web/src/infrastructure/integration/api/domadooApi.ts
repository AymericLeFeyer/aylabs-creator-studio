import { request } from '../../http/httpClient.ts';
import type { DomadooOverview } from '../../../domain/integration/entities/DomadooOverview.ts';

export interface DomadooOverviewParams {
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
}

export const domadooApi = {
  overview: (params: DomadooOverviewParams) =>
    request<DomadooOverview>('/api/domadoo/overview', { query: { ...params } }),
};
