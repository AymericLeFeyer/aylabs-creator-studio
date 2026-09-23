import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationApi } from '../../../infrastructure/integration/api/integrationApi.ts';
import {
  domadooApi,
  type DomadooOverviewParams,
} from '../../../infrastructure/integration/api/domadooApi.ts';
import type {
  IntegrationProvider,
  IntegrationUpdateInput,
} from '../../../domain/integration/entities/Integration.ts';
import { INSTAGRAM_ROOTS, TIKTOK_ROOTS, queryKeys } from '../../queryKeys.ts';

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
 * Trois exceptions à la règle du dessus : le relevé du profil TikTok **écrit dans le
 * module TikTok** (compte et relevé du jour), celui de Domadoo ajoute un point à son
 * historique, et une collecte Instagram (déclenchée depuis `/instagram`, pas depuis
 * cette liste) touche elle aussi son propre module — leurs écrans doivent donc repartir
 * aussi.
 */
export const useCollectIntegration = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: IntegrationProvider) => integrationApi.collect(provider),
    onSuccess: (_result, provider) => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
      if (provider === 'domadoo')
        void queryClient.invalidateQueries({ queryKey: ['domadooOverview'] });
      if (provider === 'instagram') {
        for (const root of INSTAGRAM_ROOTS) {
          void queryClient.invalidateQueries({ queryKey: [root] });
        }
      }
      if (provider === 'tiktok') {
        for (const root of TIKTOK_ROOTS) {
          void queryClient.invalidateQueries({ queryKey: [root] });
        }
      }
    },
  });
};

/** L'historique Domadoo, pour l'onglet Affiliations → Domadoo. */
export const useDomadooOverview = (params: DomadooOverviewParams) =>
  useQuery({
    queryKey: queryKeys.domadooOverview(params),
    queryFn: () => domadooApi.overview(params),
    staleTime: 60_000,
  });

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
