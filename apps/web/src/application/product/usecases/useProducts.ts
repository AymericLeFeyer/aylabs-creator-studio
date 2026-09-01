import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  productApi,
  type ProductListParams,
} from '../../../infrastructure/product/api/productApi.ts';
import type { ProductInput } from '../../../domain/product/entities/Product.ts';
import { PARTNER_ROOTS, queryKeys } from '../../queryKeys.ts';

/**
 * Un produit passé à « Reçu » crée une entrée de revenu en nature : l'écriture touche
 * la production **et** l'argent, donc les deux familles de vues repartent.
 */
const useProductMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const root of PARTNER_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const useProducts = (params: ProductListParams = {}) =>
  useQuery({
    queryKey: queryKeys.products(params),
    queryFn: () => productApi.list(params),
    staleTime: 15_000,
  });

export const useCreateProduct = () =>
  useProductMutation((input: ProductInput) => productApi.create(input));

export const useUpdateProduct = () =>
  useProductMutation(({ id, input }: { id: string; input: Partial<ProductInput> }) =>
    productApi.update(id, input),
  );

export const useDeleteProduct = () => useProductMutation((id: string) => productApi.remove(id));
