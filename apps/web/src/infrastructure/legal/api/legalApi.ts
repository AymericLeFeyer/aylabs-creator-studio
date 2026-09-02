import { request } from '../../http/httpClient.ts';
import type {
  Company,
  CompanyInput,
  LegalObligation,
  LegalObligationInput,
  LegalOverview,
} from '../../../domain/legal/entities/Legal.ts';

export const legalApi = {
  /** Société, obligations, tableau mensuel et alertes en une seule requête. */
  overview: () => request<LegalOverview>('/api/legal/overview'),

  updateCompany: (input: CompanyInput) =>
    request<Company>('/api/legal/company', { method: 'PATCH', body: input }),

  listObligations: (includeArchived = false) =>
    request<LegalObligation[]>('/api/legal/obligations', {
      query: { includeArchived: includeArchived ? 'true' : undefined },
    }),

  createObligation: (input: LegalObligationInput) =>
    request<LegalObligation>('/api/legal/obligations', { method: 'POST', body: input }),

  updateObligation: (id: string, input: Partial<LegalObligationInput>) =>
    request<LegalObligation>(`/api/legal/obligations/${id}`, { method: 'PATCH', body: input }),

  removeObligation: (id: string) =>
    request<void>(`/api/legal/obligations/${id}`, { method: 'DELETE' }),

  check: (obligationId: string, month: string) =>
    request<void>(`/api/legal/checks/${obligationId}/${month}`, { method: 'PUT' }),

  uncheck: (obligationId: string, month: string) =>
    request<void>(`/api/legal/checks/${obligationId}/${month}`, { method: 'DELETE' }),
};
