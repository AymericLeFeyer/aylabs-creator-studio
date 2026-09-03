import { request } from '../../http/httpClient.ts';
import type { ExpenseEntry, ExpenseEntryInput } from '../../../domain/expense/entities/Expense.ts';
import type {
  RecurringExpense,
  RecurringExpenseInput,
} from '../../../domain/expense/entities/RecurringExpense.ts';

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

/**
 * Les règles de dépense récurrente. Leurs occurrences, elles, se lisent avec les
 * dépenses ordinaires : une occurrence **est** une dépense.
 */
export const recurringExpenseApi = {
  list: () => request<RecurringExpense[]>('/api/recurring-expenses'),

  create: (input: RecurringExpenseInput) =>
    request<RecurringExpense>('/api/recurring-expenses', { method: 'POST', body: input }),

  update: (id: string, input: Partial<RecurringExpenseInput>) =>
    request<RecurringExpense>(`/api/recurring-expenses/${id}`, { method: 'PATCH', body: input }),

  remove: (id: string) => request<void>(`/api/recurring-expenses/${id}`, { method: 'DELETE' }),
};
