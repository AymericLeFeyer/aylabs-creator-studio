import { request } from '../../http/httpClient.ts';
import type { ExpenseEntry, ExpenseEntryInput } from '../../../domain/expense/entities/Expense.ts';

export interface ExpenseListParams {
  from?: string;
  to?: string;
  channelIds?: string[];
}

export const expenseApi = {
  list: (params: ExpenseListParams = {}) =>
    request<ExpenseEntry[]>('/api/expenses', {
      query: {
        from: params.from,
        to: params.to,
        channelIds: params.channelIds?.length ? params.channelIds.join(',') : undefined,
      },
    }),

  create: (input: ExpenseEntryInput) =>
    request<ExpenseEntry>('/api/expenses', { method: 'POST', body: input }),

  update: (id: string, input: Partial<ExpenseEntryInput>) =>
    request<ExpenseEntry>(`/api/expenses/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/expenses/${id}`, { method: 'DELETE' }),
};
