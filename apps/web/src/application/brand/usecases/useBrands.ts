import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { brandApi, type BrandStatsParams } from '../../../infrastructure/brand/api/brandApi.ts';
import type { BrandInput } from '../../../domain/brand/entities/Brand.ts';
import { queryKeys } from '../../queryKeys.ts';

const useBrandMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      // Renommer une marque change les libellés des classements, sa couleur change
      // leurs barres : les deux vues repartent ensemble.
      for (const root of ['brands', 'brandStats', 'products', 'sponsorships']) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const useBrands = (includeArchived = false) =>
  useQuery({
    queryKey: queryKeys.brands(includeArchived),
    queryFn: () => brandApi.list(includeArchived),
    staleTime: 60_000,
  });

/** Classements du dashboard, bornés comme le reste de l'écran. */
export const useBrandStats = (params: BrandStatsParams) =>
  useQuery({
    queryKey: queryKeys.brandStats(params),
    queryFn: () => brandApi.stats(params),
    staleTime: 30_000,
  });

export const useCreateBrand = () => useBrandMutation((input: BrandInput) => brandApi.create(input));

export const useUpdateBrand = () =>
  useBrandMutation(({ id, input }: { id: string; input: Partial<BrandInput> }) =>
    brandApi.update(id, input),
  );

export const useDeleteBrand = () => useBrandMutation((id: string) => brandApi.remove(id));
