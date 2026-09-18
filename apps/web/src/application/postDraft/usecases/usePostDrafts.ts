import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { postDraftApi } from '../../../infrastructure/postDraft/api/postDraftApi.ts';
import type { PostDraftInput } from '../../../domain/postDraft/entities/PostDraft.ts';
import { queryKeys } from '../../queryKeys.ts';

/**
 * Un brouillon n'a aucun effet de bord : seule sa propre liste est invalidée, comme le
 * carnet d'idées. Il ne touche ni l'audience, ni la file de production, ni l'argent.
 */
const usePostDraftMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.postDrafts() });
    },
  });
};

export const usePostDrafts = () =>
  useQuery({
    queryKey: queryKeys.postDrafts(),
    queryFn: () => postDraftApi.list(),
    staleTime: 30_000,
  });

export const useCreatePostDraft = () =>
  usePostDraftMutation((input: PostDraftInput) => postDraftApi.create(input));

export const useUpdatePostDraft = () =>
  usePostDraftMutation(({ id, input }: { id: string; input: Partial<PostDraftInput> }) =>
    postDraftApi.update(id, input),
  );

export const useDeletePostDraft = () =>
  usePostDraftMutation((id: string) => postDraftApi.remove(id));
