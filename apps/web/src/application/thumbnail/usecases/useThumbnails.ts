import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { thumbnailApi } from '../../../infrastructure/thumbnail/api/thumbnailApi.ts';
import type {
  GenerateThumbnailInput,
  ThumbnailSettingsInput,
} from '../../../domain/thumbnail/entities/Thumbnail.ts';
import { PRODUCTION_ROOTS, queryKeys } from '../../queryKeys.ts';

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

/**
 * Sans vidéo, toutes les miniatures ; avec, celles de cette vidéo. `saved: true` ne garde
 * que les enregistrées (l'onglet de la fiche).
 */
export const useThumbnails = (productionId: string | null, options: { saved?: boolean } = {}) =>
  useQuery({
    queryKey: queryKeys.thumbnails(productionId, options.saved),
    queryFn: () => thumbnailApi.list(productionId, options.saved),
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

/**
 * Enregistrer coche l'étape « miniature » de la vidéo côté API : la fiche, la file et la
 * pile du planning repartent avec la liste.
 */
export const useSaveThumbnail = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, productionId }: { id: string; productionId: string | null }) =>
      thumbnailApi.save(id, productionId),
    onSuccess: () =>
      Promise.all(
        [LIST_ROOT, ...PRODUCTION_ROOTS.map((root) => [root])].map((queryKey) =>
          queryClient.invalidateQueries({ queryKey }),
        ),
      ),
  });
};

/** Retirer l'enregistrement ne décoche rien : seule la liste bouge. */
export const useUnsaveThumbnail = () => useListMutation((id: string) => thumbnailApi.unsave(id));
