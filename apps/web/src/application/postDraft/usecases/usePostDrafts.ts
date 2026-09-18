import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { postDraftApi } from '../../../infrastructure/postDraft/api/postDraftApi.ts';
import type {
  PostDraft,
  PostDraftInput,
  PostDraftUpdate,
} from '../../../domain/postDraft/entities/PostDraft.ts';
import { queryKeys } from '../../queryKeys.ts';

/**
 * Un brouillon n'a aucun effet de bord hors de son module : la liste, les archives et le
 * résumé de la pastille partent ensemble (`['postDrafts']` les couvre tous), rien d'autre.
 * Archiver fait passer une ligne d'une liste à l'autre et bouge le compteur du menu.
 */
const usePostDraftMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['postDrafts'] });
    },
  });
};

export const usePostDrafts = (archived = false) =>
  useQuery({
    queryKey: queryKeys.postDrafts(archived),
    queryFn: () => postDraftApi.list(archived),
    staleTime: 30_000,
  });

/** Pour la pastille du menu : lu sur tous les écrans, d'où une requête à part et légère. */
export const usePostDraftSummary = () =>
  useQuery({
    queryKey: queryKeys.postDraftSummary(),
    queryFn: () => postDraftApi.summary(),
    staleTime: 60_000,
  });

export const useCreatePostDraft = () =>
  usePostDraftMutation((input: PostDraftInput) => postDraftApi.create(input));

const UPDATE_KEY = ['postDrafts', 'update'] as const;

/**
 * Modifier un brouillon, **avec mise à jour optimiste de la liste**.
 *
 * Les cases se cochent en rafale, et chaque requête envoie la liste complète des cases :
 * sans écrire tout de suite dans le cache, le deuxième clic partirait de l'état d'avant le
 * premier et le décocherait en silence. Pour la même raison, la liste n'est relue qu'une
 * fois la **dernière** écriture terminée — une relecture intermédiaire ramènerait un état
 * qui ne connaît pas encore les clics suivants.
 */
export const useUpdatePostDraft = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: UPDATE_KEY,
    mutationFn: ({ id, input }: { id: string; input: PostDraftUpdate }) =>
      postDraftApi.update(id, input),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: ['postDrafts'] });
      // Les deux listes : une publication archivée **reste affichée** (grisée, à son jour),
      // elle ne doit pas disparaître le temps que le réseau réponde.
      for (const archived of [false, true]) {
        queryClient.setQueryData<PostDraft[]>(queryKeys.postDrafts(archived), (drafts) =>
          drafts?.map((draft) => (draft.id === id ? applyUpdate(draft, input) : draft)),
        );
      }
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: UPDATE_KEY }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: ['postDrafts'] });
    },
  });
};

/** Ce que l'écriture fera de la ligne, calculé d'avance pour l'affichage optimiste. */
const applyUpdate = (draft: PostDraft, input: PostDraftUpdate): PostDraft => {
  const { archived, ...fields } = input;
  return {
    ...draft,
    ...fields,
    archivedAt:
      archived === undefined
        ? draft.archivedAt
        : archived
          ? (draft.archivedAt ?? new Date().toISOString())
          : null,
  };
};

export const useDeletePostDraft = () =>
  usePostDraftMutation((id: string) => postDraftApi.remove(id));
