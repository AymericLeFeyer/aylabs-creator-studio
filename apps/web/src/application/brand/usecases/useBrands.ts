import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { brandApi, type BrandStatsParams } from '../../../infrastructure/brand/api/brandApi.ts';
import type { BrandContactInput, BrandInput } from '../../../domain/brand/entities/Brand.ts';
import { queryKeys } from '../../queryKeys.ts';

const useBrandMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      // Renommer une marque change les libellés des classements, sa couleur change
      // leurs barres, et le carnet porte nom et couleur : tout repart ensemble.
      for (const root of ['brands', 'brandStats', 'brandContacts', 'products', 'sponsorships']) {
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

/**
 * Le carnet de contacts : d'une marque, ou de toutes (`null`) — c'est la liste complète
 * qui sert à la recherche de l'écran Marques et à la suggestion de marque d'un fil.
 */
export const useBrandContacts = (brandId: string | null = null) =>
  useQuery({
    queryKey: queryKeys.brandContacts(brandId),
    queryFn: () => brandApi.contacts(brandId ? { brandId } : {}),
    staleTime: 60_000,
  });

/** Une écriture de contact ne touche que le carnet. */
const useContactMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['brandContacts'] }),
  });
};

export const useCreateBrandContact = () =>
  useContactMutation(({ brandId, input }: { brandId: string; input: BrandContactInput }) =>
    brandApi.createContact(brandId, input),
  );

export const useUpdateBrandContact = () =>
  useContactMutation(({ id, input }: { id: string; input: Partial<BrandContactInput> }) =>
    brandApi.updateContact(id, input),
  );

export const useDeleteBrandContact = () =>
  useContactMutation((id: string) => brandApi.removeContact(id));
