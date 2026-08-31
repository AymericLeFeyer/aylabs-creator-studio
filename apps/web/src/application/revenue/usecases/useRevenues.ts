import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  revenueApi,
  type RevenueListParams,
} from '../../../infrastructure/revenue/api/revenueApi.ts';
import type { RevenueEntryInput } from '../../../domain/revenue/entities/Revenue.ts';
import { MONEY_ROOTS, queryKeys } from '../../queryKeys.ts';

/** Toute écriture d'argent invalide les analytics : sinon le graphique reste en retard. */
const useMoneyMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const root of MONEY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const useRevenues = (params: RevenueListParams) =>
  useQuery({
    queryKey: queryKeys.revenues(params),
    queryFn: () => revenueApi.list(params),
    staleTime: 30_000,
  });

export const useCreateRevenue = () =>
  useMoneyMutation((input: RevenueEntryInput) => revenueApi.create(input));

export const useUpdateRevenue = () =>
  useMoneyMutation(({ id, input }: { id: string; input: Partial<RevenueEntryInput> }) =>
    revenueApi.update(id, input),
  );

export const useDeleteRevenue = () => useMoneyMutation((id: string) => revenueApi.remove(id));
