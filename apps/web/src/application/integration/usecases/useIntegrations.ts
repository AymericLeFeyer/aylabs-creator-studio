import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationApi } from '../../../infrastructure/integration/api/integrationApi.ts';
import type {
  IntegrationProvider,
  IntegrationUpdateInput,
} from '../../../domain/integration/entities/Integration.ts';
import { INSTAGRAM_ROOTS, queryKeys } from '../../queryKeys.ts';

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

/**
 * Seule exception à la règle du dessus : le relevé du profil Instagram **écrit dans le
 * module Instagram** (compte et relevé du jour), ses écrans doivent donc repartir aussi.
 */
export const useCollectIntegration = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: IntegrationProvider) => integrationApi.collect(provider),
    onSuccess: (_result, provider) => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
      if (provider !== 'instagram') return;
      for (const root of INSTAGRAM_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

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
