import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  channelApi,
  type ManualMetricInput,
  type ManualSnapshotInput,
} from '../../../infrastructure/channel/api/channelApi.ts';
import type { ChannelInput } from '../../../domain/channel/entities/Channel.ts';
import { queryKeys } from '../../queryKeys.ts';

export const useChannels = (includeArchived = false) =>
  useQuery({
    queryKey: queryKeys.channels(includeArchived),
    queryFn: () => channelApi.list(includeArchived),
    staleTime: 30_000,
  });

/** Invalide chaînes et analytics : ajouter une chaîne change la vue cumulée. */
const useChannelMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
    },
  });
};

export const useCreateChannel = () =>
  useChannelMutation((input: ChannelInput) => channelApi.create(input));

export const useUpdateChannel = () =>
  useChannelMutation(({ id, input }: { id: string; input: Partial<ChannelInput> }) =>
    channelApi.update(id, input),
  );

export const useDeleteChannel = () => useChannelMutation((id: string) => channelApi.remove(id));

export const useCollectChannel = () => useChannelMutation((id: string) => channelApi.collect(id));

export const useSaveManualMetrics = () =>
  useChannelMutation(({ id, input }: { id: string; input: ManualMetricInput }) =>
    channelApi.saveMetrics(id, input),
  );

export const useSaveManualSnapshot = () =>
  useChannelMutation(({ id, input }: { id: string; input: ManualSnapshotInput }) =>
    channelApi.saveSnapshot(id, input),
  );

/** Recherche d'une chaîne par @handle ou URL, sans mise en cache. */
export const useResolveChannel = () =>
  useMutation({ mutationFn: (query: string) => channelApi.resolve(query) });
