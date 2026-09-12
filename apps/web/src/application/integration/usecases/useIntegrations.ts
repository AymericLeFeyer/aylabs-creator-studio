import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationApi } from '../../../infrastructure/integration/api/integrationApi.ts';
import type {
  IntegrationProvider,
  IntegrationUpdateInput,
} from '../../../domain/integration/entities/Integration.ts';
import { queryKeys } from '../../queryKeys.ts';

/**
 * Les sources de l'export et leurs réglages.
 *
 * Une écriture n'invalide que `integrations` : ni l'argent, ni la production, ni les
 * alertes ne dépendent de ce que le studio publie à l'extérieur — même raison que les
 * favoris de l'écran Légal.
 */
export const useIntegrations = () =>
  useQuery({
    queryKey: queryKeys.integrations(),
    queryFn: () => integrationApi.overview(),
    staleTime: 60_000,
  });

const useIntegrationMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['integrations'] }),
  });
};

export const useUpdateIntegration = () =>
  useIntegrationMutation(
    ({ provider, input }: { provider: IntegrationProvider; input: IntegrationUpdateInput }) =>
      integrationApi.update(provider, input),
  );

export const useCollectIntegration = () =>
  useIntegrationMutation((provider: IntegrationProvider) => integrationApi.collect(provider));

export const useExportKeys = () =>
  useQuery({
    queryKey: queryKeys.exportKeys(),
    queryFn: () => integrationApi.keys(),
    staleTime: 60_000,
  });

const useExportKeyMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['exportKeys'] }),
  });
};

export const useCreateExportKey = () =>
  useExportKeyMutation((label: string) => integrationApi.createKey(label));

export const useDeleteExportKey = () =>
  useExportKeyMutation((id: string) => integrationApi.deleteKey(id));
