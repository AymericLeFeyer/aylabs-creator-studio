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

/** Une sortie de moins de trois jours se suit de près. */
const LIVE_WINDOW_MS = 3 * 24 * 60 * 60_000;
const LIVE_REFRESH_MS = 60_000;
const IDLE_REFRESH_MS = 10 * 60_000;

/**
 * Les dernières sorties, relues sur YouTube pendant qu'on les regarde.
 *
 * Toutes les minutes tant que la dernière a moins de trois jours : YouTube ne met pas ses
 * compteurs à jour plus vite, et chaque relevé coûte du quota. TanStack Query suspend
 * l'intervalle quand l'onglet est caché. Sous la racine `videos`, comme les autres listes.
 */
export const useLatestVideos = (channelIds: string[], limit: number) =>
  useQuery({
    queryKey: ['videos', 'live', channelIds, limit],
    queryFn: () => videoApi.live({ channelIds, limit }),
    staleTime: 30_000,
    refetchInterval: (query) => {
      const latest = query.state.data?.[0];
      if (!latest) return IDLE_REFRESH_MS;
      const age = Date.now() - new Date(latest.publishedAt).getTime();
      return age < LIVE_WINDOW_MS ? LIVE_REFRESH_MS : IDLE_REFRESH_MS;
    },
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
