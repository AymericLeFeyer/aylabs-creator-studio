import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { postDraftApi } from '../../../infrastructure/postDraft/api/postDraftApi.ts';
import {
  shortState,
  type CoverSource,
  type PostDraft,
  type PostDraftInput,
  type PostDraftUpdate,
  type PrepareVideoPostsInput,
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

/** Une programmation qui tombe dans les deux minutes : on surveille son départ. */
const SOON_MS = 2 * 60_000;

/**
 * La liste se relit **toute seule** quand il se passe quelque chose côté serveur : toutes
 * les 3 s pendant une mise en ligne (les envois tournent en arrière-plan), toutes les 20 s
 * à l'approche d'une heure programmée, pour voir le départ sans recharger. Le reste du
 * temps, rien.
 */
const refetchShorts = (drafts: PostDraft[] | undefined): number | false => {
  if (!drafts) return false;
  if (drafts.some((draft) => shortState(draft) === 'running')) return 3_000;
  const now = Date.now();
  const soon = drafts.some(
    (draft) => shortState(draft) === 'scheduled' && Date.parse(draft.scheduledAt!) - now < SOON_MS,
  );
  return soon ? 20_000 : false;
};

export const usePostDrafts = (archived = false) =>
  useQuery({
    queryKey: queryKeys.postDrafts(archived),
    queryFn: () => postDraftApi.list(archived),
    staleTime: 30_000,
    refetchInterval: (query) => refetchShorts(query.state.data),
  });

/** Les comptes qui recevront les vidéos (`['publish', 'targets']`, invalidée par TikTok). */
export const usePublishTargets = () =>
  useQuery({
    queryKey: ['publish', 'targets'],
    queryFn: () => postDraftApi.targets(),
    staleTime: 60_000,
  });

/**
 * Dépose la vidéo d'une publication. `onProgress` suit l'envoi (XHR) : un short pèse
 * plusieurs dizaines de mégaoctets.
 */
export const useUploadDraftVideo = () =>
  usePostDraftMutation(
    ({
      id,
      file,
      onProgress,
    }: {
      id: string;
      file: File;
      onProgress?: (fraction: number) => void;
    }) => postDraftApi.uploadVideo(id, file, onProgress),
  );

export const useRemoveDraftVideo = () =>
  usePostDraftMutation((id: string) => postDraftApi.removeVideo(id));

/** Pose (`source`) ou retire (`null`) la couverture. */
export const useSetDraftCover = () =>
  usePostDraftMutation(({ id, source }: { id: string; source: CoverSource | null }) =>
    source ? postDraftApi.setCover(id, source) : postDraftApi.removeCover(id),
  );

/** « Publier maintenant », ou « Réessayer » les plateformes en échec. */
export const usePublishDraftNow = () =>
  usePostDraftMutation((id: string) => postDraftApi.publishNow(id));

/** Pour la pastille du menu : lu sur tous les écrans, d'où une requête à part et légère. */
export const usePostDraftSummary = () =>
  useQuery({
    queryKey: queryKeys.postDraftSummary(),
    queryFn: () => postDraftApi.summary(),
    staleTime: 60_000,
  });

/** Les publications tirées d'une vidéo, archivées comprises (sous `['postDrafts']`). */
export const usePostDraftsForProduction = (productionId: string | undefined) =>
  useQuery({
    queryKey: ['postDrafts', 'production', productionId ?? ''],
    queryFn: () => postDraftApi.forProduction(productionId!),
    enabled: Boolean(productionId),
    staleTime: 30_000,
  });

export const usePrepareVideoPosts = () =>
  usePostDraftMutation((input: PrepareVideoPostsInput) => postDraftApi.prepare(input));

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
