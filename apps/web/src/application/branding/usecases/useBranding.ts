import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { brandingApi } from '../../../infrastructure/branding/api/brandingApi.ts';
import type { Branding, BrandingIconKey } from '../../../domain/branding/entities/Branding.ts';
import { readCachedBranding } from '../../../infrastructure/branding/brandingCache.ts';
import { queryKeys } from '../../queryKeys.ts';

/**
 * Relu au retour sur l'onglet : un logo changé depuis le téléphone apparaît sur
 * l'ordinateur sans recharger. Aucune autre racine ne croise celle-ci.
 */
export const useBranding = () =>
  useQuery({
    queryKey: queryKeys.branding(),
    queryFn: () => brandingApi.get(),
    // Le reflet local sert au premier rendu, puis l'API est relue aussitôt
    // (`initialDataUpdatedAt: 0` le déclare périmé).
    initialData: readCachedBranding,
    initialDataUpdatedAt: 0,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

/** La réponse est la nouvelle identité complète : elle est écrite telle quelle en cache. */
const useBrandingMutation = <TVariables>(
  mutationFn: (variables: TVariables) => Promise<Branding>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (branding) => queryClient.setQueryData(queryKeys.branding(), branding),
  });
};

export const useUpdateBrandingName = () =>
  useBrandingMutation((name: string | null) => brandingApi.setName(name));

export const useSetBrandingLogo = () =>
  useBrandingMutation((icons: Record<BrandingIconKey, string>) => brandingApi.setLogo(icons));

export const useClearBrandingLogo = () => useBrandingMutation(() => brandingApi.clearLogo());
