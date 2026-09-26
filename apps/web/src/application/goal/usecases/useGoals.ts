import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { goalApi, type GoalPreviewParams } from '../../../infrastructure/goal/api/goalApi.ts';
import type { GoalInput } from '../../../domain/goal/entities/Goal.ts';
import { queryKeys } from '../../queryKeys.ts';
import { localToday } from '../../planning/usecases/usePlanning.ts';

/**
 * Les objectifs. Leur progression est recalculée par l'API à chaque lecture : relus au
 * retour sur l'onglet, une collecte faite ailleurs a pu les faire avancer. Le jour
 * **local** part avec la requête — c'est lui qui dit si une échéance est passée.
 */
export const useGoals = () => {
  const today = localToday();
  return useQuery({
    queryKey: queryKeys.goals(today),
    queryFn: () => goalApi.list(today),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
};

/** Catégories, métriques et chaînes/comptes proposés par le formulaire. */
export const useGoalCatalog = (enabled = true) =>
  useQuery({
    queryKey: queryKeys.goalCatalog(),
    queryFn: () => goalApi.catalog(),
    staleTime: 5 * 60_000,
    enabled,
  });

/**
 * La valeur au départ et la prévision, relues à chaque changement du formulaire. Les
 * données précédentes restent affichées pendant la relecture : le champ ne clignote pas.
 */
export const useGoalPreview = (params: GoalPreviewParams | null) =>
  useQuery({
    queryKey: queryKeys.goalPreview(params),
    queryFn: () => goalApi.preview({ ...params!, today: localToday() }),
    enabled: params !== null,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

const useGoalMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['goals'] }),
  });
};

export const useCreateGoal = () =>
  useGoalMutation((input: GoalInput) => goalApi.create(input, localToday()));

export const useUpdateGoal = () =>
  useGoalMutation(({ id, input }: { id: string; input: Partial<GoalInput> }) =>
    goalApi.update(id, input, localToday()),
  );

export const useDeleteGoal = () => useGoalMutation((id: string) => goalApi.remove(id));
