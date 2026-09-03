import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  expenseApi,
  recurringExpenseApi,
  type ExpenseListParams,
} from '../../../infrastructure/expense/api/expenseApi.ts';
import type { ExpenseEntryInput } from '../../../domain/expense/entities/Expense.ts';
import type { RecurringExpenseInput } from '../../../domain/expense/entities/RecurringExpense.ts';
import { MONEY_ROOTS, RECURRING_ROOTS, queryKeys } from '../../queryKeys.ts';

const useExpenseMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      // Une dépense ne change pas le CA mais change le bénéfice : les deux séries repartent.
      for (const root of MONEY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const useExpenses = (params: ExpenseListParams) =>
  useQuery({
    queryKey: queryKeys.expenses(params),
    queryFn: () => expenseApi.list(params),
    staleTime: 30_000,
  });

export const useCreateExpense = () =>
  useExpenseMutation((input: ExpenseEntryInput) => expenseApi.create(input));

export const useUpdateExpense = () =>
  useExpenseMutation(({ id, input }: { id: string; input: Partial<ExpenseEntryInput> }) =>
    expenseApi.update(id, input),
  );

export const useDeleteExpense = () => useExpenseMutation((id: string) => expenseApi.remove(id));

// --- Dépenses récurrentes ---------------------------------------------------

const useRecurringMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      // L'API reprojette les échéances à chaque écriture : les dépenses et les cumuls
      // ont changé au moment même où la règle a changé.
      for (const root of RECURRING_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const useRecurringExpenses = () =>
  useQuery({
    queryKey: queryKeys.recurringExpenses(),
    queryFn: () => recurringExpenseApi.list(),
    staleTime: 60_000,
  });

export const useCreateRecurringExpense = () =>
  useRecurringMutation((input: RecurringExpenseInput) => recurringExpenseApi.create(input));

export const useUpdateRecurringExpense = () =>
  useRecurringMutation(({ id, input }: { id: string; input: Partial<RecurringExpenseInput> }) =>
    recurringExpenseApi.update(id, input),
  );

export const useDeleteRecurringExpense = () =>
  useRecurringMutation((id: string) => recurringExpenseApi.remove(id));
