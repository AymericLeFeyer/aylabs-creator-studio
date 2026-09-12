import { request } from '../../http/httpClient.ts';
import type {
  CollectIntegrationResult,
  CreatedExportKey,
  ExportKey,
  IntegrationProvider,
  IntegrationsOverview,
  IntegrationUpdateInput,
  IntegrationView,
} from '../../../domain/integration/entities/Integration.ts';

export const integrationApi = {
  overview: () => request<IntegrationsOverview>('/api/integrations'),

  update: (provider: IntegrationProvider, input: IntegrationUpdateInput) =>
    request<IntegrationView>(`/api/integrations/${provider}`, { method: 'PATCH', body: input }),

  /** Peut prendre une vingtaine de secondes : un navigateur tourne côté serveur. */
  collect: (provider: IntegrationProvider) =>
    request<{ result: CollectIntegrationResult; integration: IntegrationView }>(
      `/api/integrations/${provider}/collect`,
      { method: 'POST' },
    ),

  keys: () => request<ExportKey[]>('/api/integrations/keys'),

  createKey: (label: string) =>
    request<CreatedExportKey>('/api/integrations/keys', { method: 'POST', body: { label } }),

  deleteKey: (id: string) => request<void>(`/api/integrations/keys/${id}`, { method: 'DELETE' }),
};
