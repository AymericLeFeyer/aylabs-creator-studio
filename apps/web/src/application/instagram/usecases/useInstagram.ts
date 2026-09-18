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

/** Les stories déclarées pour un jour (celui du navigateur). */
export const useStoryCount = (date: string, enabled = true) =>
  useQuery({
    queryKey: queryKeys.instagramStories(date),
    queryFn: () => instagramApi.storyCount(date),
    staleTime: 60_000,
    enabled,
  });

const STORY_KEY = ['instagramStories', 'set'] as const;

/**
 * Déclarer les stories d'un jour, **en optimiste** : on tape « + » trois fois d'affilée
 * après trois stories, et chaque requête porte le total. Sans écrire tout de suite dans le
 * cache, le deuxième clic repartirait de l'ancien compte. Le graphique et la pastille ne
 * sont relus qu'après la dernière écriture en vol.
 */
export const useSetStoryCount = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: STORY_KEY,
    mutationFn: ({ date, count }: { date: string; count: number }) =>
      instagramApi.setStoryCount(date, count),
    onMutate: async ({ date, count }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.instagramStories(date) });
      queryClient.setQueryData(queryKeys.instagramStories(date), { date, count });
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: STORY_KEY }) > 1) return;
      for (const root of INSTAGRAM_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const useCollectInstagramAccount = () =>
  useInstagramMutation((id: string) => instagramApi.collectOne(id));

export const useRefreshInstagramToken = () =>
  useInstagramMutation((id: string) => instagramApi.refreshToken(id));
