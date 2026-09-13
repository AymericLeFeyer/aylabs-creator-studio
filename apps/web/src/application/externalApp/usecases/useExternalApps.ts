import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { externalAppApi } from '../../../infrastructure/externalApp/api/externalAppApi.ts';
import type { ExternalAppInput } from '../../../domain/externalApp/entities/ExternalApp.ts';
import { queryKeys } from '../../queryKeys.ts';
import { localToday } from '../../planning/usecases/usePlanning.ts';

/**
 * Les applications externes du menu. Lues par le menu lui-même, donc sur **tous** les
 * écrans : le cache est long, une écriture l'invalide.
 */
export const useExternalApps = () =>
  useQuery({
    queryKey: queryKeys.externalApps(),
    queryFn: () => externalAppApi.list(),
    staleTime: 5 * 60_000,
  });

/**
 * Une écriture repart aussi sur `todoToday` : ajouter ou réactiver l'app Todo fait naître
 * sa pastille, et la pastille ne doit pas attendre la minute suivante pour apparaître.
 */
const useExternalAppMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['externalApps'] });
      void queryClient.invalidateQueries({ queryKey: ['todoToday'] });
    },
  });
};

export const useCreateExternalApp = () =>
  useExternalAppMutation((input: ExternalAppInput) => externalAppApi.create(input));

export const useUpdateExternalApp = () =>
  useExternalAppMutation(
    ({ id, input }: { id: string; input: Partial<Omit<ExternalAppInput, 'kind'>> }) =>
      externalAppApi.update(id, input),
  );

export const useDeleteExternalApp = () =>
  useExternalAppMutation((id: string) => externalAppApi.remove(id));

/**
 * Les tâches Todo ouvertes du jour : la pastille de l'entrée Todo.
 *
 * **Relue toutes les minutes**, et c'est la seule requête du studio à le faire : ce qu'on
 * coche dans l'iframe ne passe pas par le studio, aucune mutation ne peut donc invalider
 * ce compteur. Une minute de retard sur une pastille est acceptable ; un compteur figé
 * jusqu'au rechargement ne l'est pas. Désactivée tant que l'app Todo n'est pas au menu.
 */
export const useTodayTodos = (enabled: boolean) => {
  const today = localToday();
  return useQuery({
    queryKey: queryKeys.todoToday(today),
    queryFn: () => externalAppApi.todayTodos(today),
    enabled,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
};
