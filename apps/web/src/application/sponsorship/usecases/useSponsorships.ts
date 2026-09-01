import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  sponsorshipApi,
  type SponsorshipListParams,
} from '../../../infrastructure/sponsorship/api/sponsorshipApi.ts';
import type { SponsorshipInput } from '../../../domain/sponsorship/entities/Sponsorship.ts';
import { PARTNER_ROOTS, queryKeys } from '../../queryKeys.ts';

/** Même raison que pour les produits : une sponso payée crée un revenu cash. */
const useSponsorshipMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const root of PARTNER_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const useSponsorships = (params: SponsorshipListParams = {}) =>
  useQuery({
    queryKey: queryKeys.sponsorships(params),
    queryFn: () => sponsorshipApi.list(params),
    staleTime: 15_000,
  });

export const useCreateSponsorship = () =>
  useSponsorshipMutation((input: SponsorshipInput) => sponsorshipApi.create(input));

export const useUpdateSponsorship = () =>
  useSponsorshipMutation(({ id, input }: { id: string; input: Partial<SponsorshipInput> }) =>
    sponsorshipApi.update(id, input),
  );

export const useDeleteSponsorship = () =>
  useSponsorshipMutation((id: string) => sponsorshipApi.remove(id));
