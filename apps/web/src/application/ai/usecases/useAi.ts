import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiApi } from '../../../infrastructure/ai/api/aiApi.ts';
import type { AiSettingsInput } from '../../../domain/ai/entities/Ai.ts';

/** Relue chaque minute : chaque appel à l'IA, mails compris, entame le solde affiché. */
export const useAiSettings = () =>
  useQuery({
    queryKey: ['aiSettings'],
    queryFn: () => aiApi.settings(),
    refetchInterval: 60_000,
  });

/**
 * Changer la clé change ce que proposent les écrans qui s'en servent : la boîte mail lit
 * `aiConfigured` dans ses réglages et ses statistiques, d'où l'invalidation de `['mails']`.
 */
export const useUpdateAiSettings = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: AiSettingsInput) => aiApi.update(input),
    onSuccess: (view) => {
      queryClient.setQueryData(['aiSettings'], view);
      void queryClient.invalidateQueries({ queryKey: ['mails'] });
    },
  });
};
