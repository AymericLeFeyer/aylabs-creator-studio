import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { thumbnailApi } from '../../../infrastructure/thumbnail/api/thumbnailApi.ts';
import type {
  GenerateThumbnailInput,
  ThumbnailSettingsInput,
} from '../../../domain/thumbnail/entities/Thumbnail.ts';
import { queryKeys } from '../../queryKeys.ts';

const LIST_ROOT = ['thumbnails', 'list'];

export const useThumbnailSettings = () =>
  useQuery({
    queryKey: queryKeys.thumbnailSettings(),
    queryFn: () => thumbnailApi.settings(),
  });

export const useUpdateThumbnailSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ThumbnailSettingsInput) => thumbnailApi.updateSettings(input),
    onSuccess: (view) => queryClient.setQueryData(queryKeys.thumbnailSettings(), view),
  });
};

export const useThumbnailAssets = () =>
  useQuery({
    queryKey: queryKeys.thumbnailAssets(),
    queryFn: () => thumbnailApi.assets(),
  });

const useAssetMutation = <T>(mutationFn: (input: T) => Promise<unknown>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.thumbnailAssets() }),
  });
};

export const useAddThumbnailAsset = () =>
  useAssetMutation((input: { label: string; image: string }) => thumbnailApi.addAsset(input));

export const useDeleteThumbnailAsset = () =>
  useAssetMutation((id: string) => thumbnailApi.deleteAsset(id));

/** Sans vidéo, toutes les miniatures ; avec, celles de cette vidéo. */
export const useThumbnails = (productionId: string | null) =>
  useQuery({
    queryKey: queryKeys.thumbnails(productionId),
    queryFn: () => thumbnailApi.list(productionId),
  });

const useListMutation = <T>(mutationFn: (input: T) => Promise<unknown>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LIST_ROOT }),
  });
};

/** Facturé à chaque appel, et long : à ne déclencher que sur un clic. */
export const useGenerateThumbnail = () =>
  useListMutation((input: GenerateThumbnailInput) => thumbnailApi.generate(input));

export const useDeleteThumbnail = () => useListMutation((id: string) => thumbnailApi.delete(id));
