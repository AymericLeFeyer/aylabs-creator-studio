import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  instagramApi,
  type InstagramOverviewParams,
} from '../../../infrastructure/instagram/api/instagramApi.ts';
import type { InstagramAccountInput } from '../../../domain/instagram/entities/Instagram.ts';
import { INSTAGRAM_ROOTS, queryKeys } from '../../queryKeys.ts';

/**
 * Toute écriture Instagram invalide le module entier.
 *
 * Le découpage n'est pas plus fin volontairement : une collecte touche les comptes, les
 * séries, les stories et les publications d'un seul coup, et le module est assez petit
 * pour que le refetch soit indolore.
 */
const useInstagramMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const root of INSTAGRAM_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const useInstagramOverview = (params: InstagramOverviewParams) =>
  useQuery({
    queryKey: queryKeys.instagramOverview(params),
    queryFn: () => instagramApi.overview(params),
    staleTime: 60_000,
  });

export const useInstagramAccounts = (includeArchived = false) =>
  useQuery({
    queryKey: queryKeys.instagramAccounts(includeArchived),
    queryFn: () => instagramApi.accounts(includeArchived),
    staleTime: 5 * 60_000,
  });

export const useCreateInstagramAccount = () =>
  useInstagramMutation((input: InstagramAccountInput) => instagramApi.create(input));

export const useUpdateInstagramAccount = () =>
  useInstagramMutation((input: { id: string; input: Partial<InstagramAccountInput> }) =>
    instagramApi.update(input.id, input.input),
  );

export const useDeleteInstagramAccount = () =>
  useInstagramMutation((id: string) => instagramApi.remove(id));

/**
 * La collecte manuelle.
 *
 * Elle a plus d'importance ici qu'ailleurs : chaque passage attrape les stories des
 * dernières 24 h, et celles qu'on manque sont perdues pour toujours. C'est pour ça que le
 * bouton est en évidence sur l'écran, et pas rangé dans les réglages.
 */
export const useCollectInstagram = () => useInstagramMutation(() => instagramApi.collectAll());

export const useCollectInstagramAccount = () =>
  useInstagramMutation((id: string) => instagramApi.collectOne(id));

export const useRefreshInstagramToken = () =>
  useInstagramMutation((id: string) => instagramApi.refreshToken(id));
