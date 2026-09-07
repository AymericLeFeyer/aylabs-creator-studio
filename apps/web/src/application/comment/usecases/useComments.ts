import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  commentApi,
  type CommentListParams,
} from '../../../infrastructure/comment/api/commentApi.ts';
import type { CommentStatus } from '../../../domain/comment/entities/Comment.ts';
import { COMMENT_ROOTS, queryKeys } from '../../queryKeys.ts';

/**
 * Toute écriture invalide le module entier — les listes **et** les compteurs.
 *
 * Trier un commentaire le fait sortir d'un onglet et entrer dans un autre, et change les
 * trois pastilles en même temps : un découpage plus fin obligerait à énumérer les
 * combinaisons, pour un gain nul sur des listes de cette taille.
 */
const useCommentMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const root of COMMENT_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const useComments = (params: CommentListParams = {}) =>
  useQuery({
    queryKey: queryKeys.comments(params),
    queryFn: () => commentApi.list(params),
    staleTime: 60_000,
  });

export const useCommentCounts = (channelIds?: string[]) =>
  useQuery({
    queryKey: queryKeys.commentCounts(channelIds ?? []),
    queryFn: () => commentApi.stats(channelIds),
    staleTime: 60_000,
  });

export const useSetCommentStatus = () =>
  useCommentMutation((input: { id: string; status: CommentStatus }) =>
    commentApi.setStatus(input.id, input.status),
  );

/**
 * La collecte manuelle.
 *
 * Elle tourne déjà avec celle des métriques ; le bouton sert à ne pas attendre le
 * prochain passage quand on vient de publier et qu'on veut voir les premiers retours.
 */
export const useCollectComments = () => useCommentMutation(() => commentApi.collect());
