import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { publishApi } from '../../../infrastructure/publish/api/publishApi.ts';
import {
  isAttemptRunning,
  type PrepareInstagramInput,
  type StartTikTokInput,
  type StartYouTubeInput,
  type YouTubeThumbnailSource,
} from '../../../domain/publish/entities/Publish.ts';

/** Racine `['publish']` : elle ne croise aucune autre (banc d'essai, rien n'en dépend). */
const UPLOADS_KEY = ['publish', 'uploads'];

export const usePublishTargets = () =>
  useQuery({ queryKey: ['publish', 'targets'], queryFn: () => publishApi.targets() });

/** Relue toutes les 3 s tant qu'un envoi tourne : l'API le mène en arrière-plan. */
export const usePublishUploads = () =>
  useQuery({
    queryKey: UPLOADS_KEY,
    queryFn: () => publishApi.uploads(),
    refetchInterval: (query) =>
      query.state.data?.some((upload) => upload.attempts.some(isAttemptRunning)) ? 3_000 : false,
  });

const usePublishMutation = <T, R>(mutationFn: (input: T) => Promise<R>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: UPLOADS_KEY }),
  });
};

export const useUploadPublishVideo = () =>
  usePublishMutation(
    ({ file, onProgress }: { file: File; onProgress?: (fraction: number) => void }) =>
      publishApi.upload(file, onProgress),
  );

export const useDeletePublishVideo = () =>
  usePublishMutation((id: string) => publishApi.delete(id));

export const useSendToYouTube = () =>
  usePublishMutation(({ uploadId, input }: { uploadId: string; input: StartYouTubeInput }) =>
    publishApi.youtube(uploadId, input),
  );

export const useSetYouTubeThumbnail = () =>
  usePublishMutation(
    ({ attemptId, source }: { attemptId: string; source: YouTubeThumbnailSource }) =>
      publishApi.youtubeThumbnail(attemptId, source),
  );

export const usePrepareInstagram = () =>
  usePublishMutation(({ uploadId, input }: { uploadId: string; input: PrepareInstagramInput }) =>
    publishApi.prepareInstagram(uploadId, input),
  );

export const usePublishInstagram = () =>
  usePublishMutation((attemptId: string) => publishApi.publishInstagram(attemptId));

export const useSendToTikTok = () =>
  usePublishMutation(({ uploadId, input }: { uploadId: string; input: StartTikTokInput }) =>
    publishApi.tiktok(uploadId, input),
  );
