import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { achievementApi } from '../../../infrastructure/achievement/api/achievementApi.ts';
import { queryKeys } from '../../queryKeys.ts';
import { useSharedPreference } from '../../sharedPreference/usecases/useSharedPreference.ts';

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

/** `youtube:<id>` — une chaîne ou un compte, tel que l'exclusion le retient. */
export const achievementEntityKey = (item: { platform: string; entityId: string }) =>
  `${item.platform}:${item.entityId}`;

const parseKeys = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;

/**
 * Les achievements **sans les comptes exclus** (« je ne veux que ma chaîne principale »).
 * L'exclusion est une préférence partagée entre appareils (`achievements.hiddenEntities`),
 * comme le dashboard qui porte les blocs : elle vaut pour l'écran **et** pour les trois
 * blocs, partout. L'API renvoie toujours tout ; le tri se fait ici, et seulement ici.
 *
 * On retient les **exclus** et non les retenus : un compte connecté demain doit apparaître
 * de lui-même, pas attendre qu'on vienne le cocher.
 */
export const useVisibleAchievements = () => {
  const query = useAchievements();
  const [hidden, setHidden] = useSharedPreference<string[]>(
    'achievements.hiddenEntities',
    [],
    parseKeys,
  );
  const data = useMemo(() => {
    if (!query.data) return undefined;
    const excluded = new Set(hidden);
    return {
      tracks: query.data.tracks.filter((track) => !excluded.has(achievementEntityKey(track))),
      records: query.data.records.filter((record) => !excluded.has(achievementEntityKey(record))),
    };
  }, [query.data, hidden]);
  return { ...query, data, all: query.data, hidden, setHidden };
};
