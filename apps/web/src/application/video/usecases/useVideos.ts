import { useQuery } from '@tanstack/react-query';
import { videoApi, type VideoListParams } from '../../../infrastructure/video/api/videoApi.ts';
import { queryKeys } from '../../queryKeys.ts';

/**
 * Sorties de vidéo, pour le sélecteur de rattachement des revenus et des dépenses.
 *
 * Les vidéos ne changent qu'à la collecte : un cache long évite de relancer la requête
 * à chaque ouverture du formulaire.
 */
export const useVideos = (params: VideoListParams = {}) =>
  useQuery({
    queryKey: queryKeys.videos(params),
    queryFn: () => videoApi.list(params),
    staleTime: 5 * 60_000,
  });
