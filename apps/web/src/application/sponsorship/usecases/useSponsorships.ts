import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  sponsorshipApi,
  type SponsorshipListParams,
} from '../../../infrastructure/sponsorship/api/sponsorshipApi.ts';
import type {
  RequirementInput,
  SponsorshipInput,
} from '../../../domain/sponsorship/entities/Sponsorship.ts';
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

/**
 * Les plans à filmer n'invalident que la liste des sponsos, et pas `PARTNER_ROOTS` :
 * cocher « macro du logo » ne change ni un revenu, ni une alerte, ni un classement de
 * marque. Repartir sur tout le module ferait clignoter le dashboard pour une case.
 */
const useRequirementMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sponsorships'] });
    },
  });
};

export const useAddRequirement = () =>
  useRequirementMutation(
    ({ sponsorshipId, input }: { sponsorshipId: string; input: RequirementInput }) =>
      sponsorshipApi.addRequirement(sponsorshipId, input),
  );

export const useUpdateRequirement = () =>
  useRequirementMutation(
    ({
      sponsorshipId,
      id,
      input,
    }: {
      sponsorshipId: string;
      id: string;
      input: Partial<RequirementInput>;
    }) => sponsorshipApi.updateRequirement(sponsorshipId, id, input),
  );

export const useDeleteRequirement = () =>
  useRequirementMutation(({ sponsorshipId, id }: { sponsorshipId: string; id: string }) =>
    sponsorshipApi.removeRequirement(sponsorshipId, id),
  );
