import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { integrationApi } from '../../../infrastructure/integration/api/integrationApi.ts';
import {
  domadooApi,
  type DomadooOverviewParams,
} from '../../../infrastructure/integration/api/domadooApi.ts';
import {
  amazonApi,
  type AmazonOverviewParams,
} from '../../../infrastructure/integration/api/amazonApi.ts';
import {
  discordApi,
  type DiscordHistoryParams,
} from '../../../infrastructure/integration/api/discordApi.ts';
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
 * Quatre exceptions à la règle du dessus : le relevé du profil TikTok **écrit dans le
 * module TikTok** (compte et relevé du jour), ceux de Domadoo et d'Amazon ajoutent un
 * point à leur historique, Discord de même, et une collecte Instagram (déclenchée depuis
 * `/instagram`, pas depuis cette liste) touche elle aussi son propre module — leurs
 * écrans doivent donc repartir aussi.
 */
export const useCollectIntegration = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: IntegrationProvider) => integrationApi.collect(provider),
    onSuccess: (_result, provider) => {
      void queryClient.invalidateQueries({ queryKey: ['integrations'] });
      if (provider === 'domadoo')
        void queryClient.invalidateQueries({ queryKey: ['domadooOverview'] });
      if (provider === 'amazon')
        void queryClient.invalidateQueries({ queryKey: ['amazonOverview'] });
      if (provider === 'discord')
        void queryClient.invalidateQueries({ queryKey: ['discordHistory'] });
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

/** L'historique Amazon Partenaires, pour l'onglet Affiliations → Amazon. */
export const useAmazonOverview = (params: AmazonOverviewParams) =>
  useQuery({
    queryKey: queryKeys.amazonOverview(params),
    queryFn: () => amazonApi.overview(params),
    staleTime: 60_000,
    placeholderData: (previous) => previous,
  });

/** L'historique Discord, un point par collecte. */
export const useDiscordHistory = (params: DiscordHistoryParams) =>
  useQuery({
    queryKey: queryKeys.discordHistory(params),
    queryFn: () => discordApi.history(params),
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
