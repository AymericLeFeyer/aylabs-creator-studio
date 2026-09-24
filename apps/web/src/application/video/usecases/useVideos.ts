import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { videoApi, type VideoListParams } from '../../../infrastructure/video/api/videoApi.ts';
import { queryKeys } from '../../queryKeys.ts';

/**
 * Sorties de vidéo, pour le sélecteur de rattachement des revenus et des dépenses.
 *
 * Les vidéos ne changent qu'à la collecte : un cache long évite de relancer la requête
 * à chaque ouverture du formulaire.
 */
export const useVideos = (params: VideoListParams = {}, options: { enabled?: boolean } = {}) =>
  useQuery({
    queryKey: queryKeys.videos(params),
    queryFn: () => videoApi.list(params),
    staleTime: 5 * 60_000,
    enabled: options.enabled ?? true,
  });

/**
 * Masquer ou réafficher une vidéo dans « Dernières sorties ». Seules les listes de vidéos
 * repartent : le drapeau n'agit sur aucun chiffre, aucun graphique.
 */
export const useSetVideoHidden = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, hidden }: { id: string; hidden: boolean }) => videoApi.setHidden(id, hidden),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['videos'] });
    },
  });
};
