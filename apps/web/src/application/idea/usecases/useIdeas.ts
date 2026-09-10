import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ideaApi } from '../../../infrastructure/idea/api/ideaApi.ts';
import type { IdeaInput } from '../../../domain/idea/entities/Idea.ts';
import type { ProductionFormat } from '../../../domain/production/entities/Production.ts';
import { queryKeys } from '../../queryKeys.ts';

/**
 * Le carnet d'idées n'a aucun effet de bord : seule sa propre liste est invalidée.
 * Promouvoir une idée en vidéo, en revanche, passe par `useCreateProduction`, qui
 * invalide tout le module de production.
 */
const useIdeaMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ideas'] });
    },
  });
};

/** Le carnet d'un menu. La clé reste sous `['ideas']` : une écriture invalide les deux. */
export const useIdeas = (format?: ProductionFormat) =>
  useQuery({
    queryKey: queryKeys.ideas(format),
    queryFn: () => ideaApi.list(format),
    staleTime: 30_000,
  });

export const useCreateIdea = () => useIdeaMutation((input: IdeaInput) => ideaApi.create(input));

export const useUpdateIdea = () =>
  useIdeaMutation(({ id, input }: { id: string; input: Partial<IdeaInput> }) =>
    ideaApi.update(id, input),
  );

export const useDeleteIdea = () => useIdeaMutation((id: string) => ideaApi.remove(id));
