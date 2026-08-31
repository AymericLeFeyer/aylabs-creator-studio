import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  analyticsApi,
  type AnalyticsParams,
} from '../../../infrastructure/analytics/api/analyticsApi.ts';
import { queryKeys } from '../../queryKeys.ts';

/** Charge les séries du dashboard. C'est la requête principale de l'application. */
export const useAnalytics = (params: AnalyticsParams) =>
  useQuery({
    queryKey: queryKeys.analytics(params),
    queryFn: () => analyticsApi.get(params),
    // Les chiffres ne bougent qu'à la collecte horaire : inutile de refetch en boucle.
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });

/** Déclenche une collecte de toutes les chaînes, puis rafraîchit tout l'écran. */
export const useCollectAll = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => analyticsApi.collectAll(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['analytics'] });
      void queryClient.invalidateQueries({ queryKey: ['channels'] });
    },
  });
};
