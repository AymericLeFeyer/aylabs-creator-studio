import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  categoryApi,
  type CategoryListParams,
} from '../../../infrastructure/category/api/categoryApi.ts';
import type { CategoryInput } from '../../../domain/category/entities/Category.ts';
import { MONEY_ROOTS, queryKeys } from '../../queryKeys.ts';

/**
 * Une catégorie change les libellés et les couleurs de tous les graphiques :
 * on invalide les vues d'argent en plus de la liste elle-même.
 */
const useCategoryMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const root of MONEY_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
  });
};

export const useCategories = (params: CategoryListParams = {}) =>
  useQuery({
    queryKey: queryKeys.categories(params),
    queryFn: () => categoryApi.list(params),
    staleTime: 5 * 60_000,
  });

export const useCreateCategory = () =>
  useCategoryMutation((input: CategoryInput) => categoryApi.create(input));

export const useUpdateCategory = () =>
  useCategoryMutation(({ id, input }: { id: string; input: Partial<CategoryInput> }) =>
    categoryApi.update(id, input),
  );

export const useDeleteCategory = () => useCategoryMutation((id: string) => categoryApi.remove(id));
