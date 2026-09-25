import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sharedPreferenceApi } from '../../../infrastructure/sharedPreference/api/sharedPreferenceApi.ts';
import { queryKeys } from '../../queryKeys.ts';

/**
 * Une préférence **partagée entre appareils** (table `app_preferences`) : ce qu'on règle sur
 * l'ordinateur et qu'on veut retrouver tel quel sur le téléphone. Les préférences propres à
 * un appareil (menu replié, zoom du planning) restent dans `usePreferences`.
 *
 * L'API ne connaît pas la forme des valeurs : c'est ici qu'on la vérifie (`parse`), et une
 * valeur qui ne convient pas retombe sur `fallback`. L'écriture est **optimiste** — la
 * case se coche au clic — et la réponse, qui porte toutes les préférences, remplace le cache.
 */
export const useSharedPreference = <T>(
  key: string,
  fallback: T,
  parse: (value: unknown) => T | undefined,
) => {
  const queryClient = useQueryClient();
  const queryKey = queryKeys.sharedPreferences();
  const { data } = useQuery({
    queryKey,
    queryFn: () => sharedPreferenceApi.list(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
  const mutation = useMutation({
    mutationFn: (value: T) => sharedPreferenceApi.set(key, value),
    onMutate: async (value: T) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Record<string, unknown>>(queryKey);
      queryClient.setQueryData<Record<string, unknown>>(queryKey, (all) => ({
        ...all,
        [key]: value,
      }));
      return { previous };
    },
    onError: (_error, _value, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSuccess: (all) => queryClient.setQueryData(queryKey, all),
  });

  const stored = data?.[key];
  const value = stored === undefined ? fallback : (parse(stored) ?? fallback);
  return [value, (next: T) => mutation.mutate(next)] as const;
};
