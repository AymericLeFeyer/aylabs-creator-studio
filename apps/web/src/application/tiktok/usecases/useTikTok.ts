import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  tiktokApi,
  type TikTokOverviewParams,
} from '../../../infrastructure/tiktok/api/tiktokApi.ts';
import type { UpdateTikTokAccountInput } from '../../../domain/tiktok/entities/TikTok.ts';
import { TIKTOK_ROOTS, queryKeys } from '../../queryKeys.ts';

/**
 * TikTok, profil public uniquement.
 *
 * Toute écriture invalide le module entier — même parti pris qu'Instagram : une
 * collecte touche le compte, les séries et les vidéos d'un seul coup, et le module est
 * assez petit pour que le refetch soit indolore.
 */
const useTikTokMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const root of TIKTOK_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const useTikTokOverview = (params: TikTokOverviewParams) =>
  useQuery({
    queryKey: queryKeys.tiktokOverview(params),
    queryFn: () => tiktokApi.overview(params),
    staleTime: 60_000,
  });

export const useTikTokAccounts = (includeArchived = false) =>
  useQuery({
    queryKey: queryKeys.tiktokAccounts(includeArchived),
    queryFn: () => tiktokApi.accounts(includeArchived),
    staleTime: 5 * 60_000,
  });

export const useUpdateTikTokAccount = () =>
  useTikTokMutation((input: { id: string; input: UpdateTikTokAccountInput }) =>
    tiktokApi.update(input.id, input.input),
  );

export const useDeleteTikTokAccount = () => useTikTokMutation((id: string) => tiktokApi.remove(id));
