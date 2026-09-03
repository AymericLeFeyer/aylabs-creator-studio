import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  affiliateApi,
  type PlatformListParams,
} from '../../../infrastructure/affiliate/api/affiliateApi.ts';
import type { AffiliatePlatformInput } from '../../../domain/affiliate/entities/AffiliatePlatform.ts';
import { queryKeys } from '../../queryKeys.ts';

/**
 * Écrire une plateforme n'invalide que les plateformes **et les revenus**.
 *
 * Les revenus, parce que la liste affiche le nom de la plateforme rattachée : la
 * renommer doit se voir dans le grand livre. Rien d'autre ne bouge — une plateforme ne
 * change ni un total, ni une alerte, ni un graphique.
 */
const usePlatformMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['affiliatePlatforms'] });
      void queryClient.invalidateQueries({ queryKey: ['revenues'] });
    },
  });
};

export const usePlatforms = (params: PlatformListParams = {}) =>
  useQuery({
    queryKey: queryKeys.affiliatePlatforms(params),
    queryFn: () => affiliateApi.list(params),
    staleTime: 60_000,
  });

export const useCreatePlatform = () =>
  usePlatformMutation((input: AffiliatePlatformInput) => affiliateApi.create(input));

export const useUpdatePlatform = () =>
  usePlatformMutation(({ id, input }: { id: string; input: Partial<AffiliatePlatformInput> }) =>
    affiliateApi.update(id, input),
  );

export const useDeletePlatform = () => usePlatformMutation((id: string) => affiliateApi.remove(id));
