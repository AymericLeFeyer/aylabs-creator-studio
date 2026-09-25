import { useQuery } from '@tanstack/react-query';
import { achievementApi } from '../../../infrastructure/achievement/api/achievementApi.ts';
import { queryKeys } from '../../queryKeys.ts';

/**
 * Les achievements, recalculés par l'API à chaque lecture. Relus au retour sur l'onglet :
 * une collecte faite ailleurs peut avoir franchi un palier. Aucune écriture ne les touche,
 * donc aucune racine d'invalidation à croiser.
 */
export const useAchievements = () =>
  useQuery({
    queryKey: queryKeys.achievements(),
    queryFn: () => achievementApi.list(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
