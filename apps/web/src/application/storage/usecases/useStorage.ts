import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { storageApi } from '../../../infrastructure/storage/api/storageApi.ts';

/** Relue à l'ouverture seulement : mesurer coûte une lecture de toutes les tables. */
export const useStorage = () =>
  useQuery({ queryKey: ['storage'], queryFn: () => storageApi.overview(), staleTime: 0 });

/**
 * Une purge retire des miniatures, des pièces jointes ou des fichiers de vidéo : les
 * écrans qui les listent repartent aussi, sinon ils afficheraient des images disparues.
 */
const useStorageMutation = <TVars, TData>(mutationFn: (vars: TVars) => Promise<TData>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const root of ['storage', 'thumbnails', 'mails', 'postDrafts']) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const usePurgeStorage = () => useStorageMutation(storageApi.purge);
export const useCompactStorage = () => useStorageMutation(() => storageApi.compact());
