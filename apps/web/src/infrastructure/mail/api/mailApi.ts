import { request } from '../../http/httpClient.ts';
import type {
  MailAddressCandidate,
  MailAiRequest,
  MailDateCheck,
  MailFolderInfo,
  MailSettingsInput,
  MailSettingsView,
  MailStats,
  MailThreadFilter,
  MailThreadSummary,
  MailThreadView,
  PreparedMailDraft,
  SendMailInput,
} from '../../../domain/mail/entities/Mail.ts';
import type { ProductionNote } from '../../../domain/production/entities/ProductionNote.ts';

export const mailApi = {
  settings: () => request<MailSettingsView>('/api/mails/settings'),
  updateSettings: (input: MailSettingsInput) =>
    request<MailSettingsView>('/api/mails/settings', { method: 'PATCH', body: input }),
  folders: () => request<MailFolderInfo[]>('/api/mails/folders'),
  move: (id: string, folder: string) =>
    request<MailThreadView>(`/api/mails/threads/${id}/move`, { method: 'POST', body: { folder } }),
  addresses: () => request<MailAddressCandidate[]>('/api/mails/addresses'),
  test: () => request<{ folders: string[] }>('/api/mails/settings/test', { method: 'POST' }),

  stats: () => request<MailStats>('/api/mails/stats'),
  sync: () =>
    request<{ created: number; error: string | null; stats: MailStats }>('/api/mails/sync', {
      method: 'POST',
    }),

  threads: (filter: MailThreadFilter) =>
    request<MailThreadSummary[]>('/api/mails/threads', {
      query: {
        search: filter.search || undefined,
        view: filter.view,
        folder: filter.folder,
        brandId: filter.brandId,
        productionId: filter.productionId,
      },
    }),
  thread: (id: string) => request<MailThreadView>(`/api/mails/threads/${id}`),
  updateThread: (
    id: string,
    input: { brandId?: string | null; productionId?: string | null; read?: boolean },
  ) => request<MailThreadView>(`/api/mails/threads/${id}`, { method: 'PATCH', body: input }),

  ai: (id: string, input: MailAiRequest) =>
    request<{ text: string }>(`/api/mails/threads/${id}/ai`, { method: 'POST', body: input }),
  summarizeMessage: (id: string) =>
    request<{ text: string }>(`/api/mails/messages/${id}/summarize`, { method: 'POST' }),
  checkDates: (id: string, today: string) =>
    request<MailDateCheck>(`/api/mails/threads/${id}/check-dates`, {
      method: 'POST',
      query: { today },
    }),
  videoNote: (id: string) =>
    request<ProductionNote>(`/api/mails/threads/${id}/video-note`, { method: 'POST' }),

  /** Le brouillon préparé par le MCP. */
  draft: (id: string) => request<PreparedMailDraft>(`/api/mails/drafts/${id}`),

  /** Le seul appel qui fasse partir un mail. */
  send: (input: SendMailInput) =>
    request<{ messageId: string; threadId: string | null }>('/api/mails/send', {
      method: 'POST',
      body: input,
    }),
};
