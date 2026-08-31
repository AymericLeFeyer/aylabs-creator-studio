import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  expenseApi,
  type ExpenseListParams,
} from '../../../infrastructure/expense/api/expenseApi.ts';
import type { ExpenseEntryInput } from '../../../domain/expense/entities/Expense.ts';
import { MONEY_ROOTS, queryKeys } from '../../queryKeys.ts';

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
