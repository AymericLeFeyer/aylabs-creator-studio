import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { liveIdeaApi } from '../../../infrastructure/live/api/liveIdeaApi.ts';
import type { LiveIdeaInput } from '../../../domain/live/entities/LiveIdea.ts';

export const useLiveIdeas = () =>
  useQuery({ queryKey: ['liveIdeas'], queryFn: liveIdeaApi.list, staleTime: 30_000 });

/**
 * Une écriture invalide la liste **et le planning** : un live daté y est affiché, et un
 * replan en tient compte comme d'une plage occupée.
 */
const useLiveMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['liveIdeas'] });
      void queryClient.invalidateQueries({ queryKey: ['planningBoard'] });
    },
  });
};

export const useCreateLiveIdea = () =>
  useLiveMutation((input: LiveIdeaInput) => liveIdeaApi.create(input));

export const useUpdateLiveIdea = () =>
  useLiveMutation(({ id, input }: { id: string; input: Partial<LiveIdeaInput> }) =>
    liveIdeaApi.update(id, input),
  );

export const useDeleteLiveIdea = () => useLiveMutation((id: string) => liveIdeaApi.remove(id));
