import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { legalApi } from '../../../infrastructure/legal/api/legalApi.ts';
import type { CompanyInput, LegalObligationInput } from '../../../domain/legal/entities/Legal.ts';
import { LEGAL_ROOTS, queryKeys } from '../../queryKeys.ts';

/**
 * Toute écriture invalide l'aperçu **et** le référentiel : changer un jour limite
 * déplace une échéance sur tous les mois du tableau, et cocher une case fait
 * disparaître une alerte du dashboard.
 */
const useLegalMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const root of LEGAL_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

/** Société, obligations, tableau mensuel et alertes : une requête pour tout l'écran. */
export const useLegalOverview = () =>
  useQuery({
    queryKey: queryKeys.legalOverview(),
    queryFn: () => legalApi.overview(),
    staleTime: 60_000,
  });

export const useLegalObligations = (includeArchived = false) =>
  useQuery({
    queryKey: queryKeys.legalObligations(includeArchived),
    queryFn: () => legalApi.listObligations(includeArchived),
    staleTime: 5 * 60_000,
  });

export const useUpdateCompany = () =>
  useLegalMutation((input: CompanyInput) => legalApi.updateCompany(input));

export const useCreateObligation = () =>
  useLegalMutation((input: LegalObligationInput) => legalApi.createObligation(input));

export const useUpdateObligation = () =>
  useLegalMutation(({ id, input }: { id: string; input: Partial<LegalObligationInput> }) =>
    legalApi.updateObligation(id, input),
  );

export const useDeleteObligation = () =>
  useLegalMutation((id: string) => legalApi.removeObligation(id));

/** Cocher / décocher une case du tableau mensuel. */
export const useToggleLegalCheck = () =>
  useLegalMutation(
    ({
      obligationId,
      month,
      checked,
    }: {
      obligationId: string;
      month: string;
      checked: boolean;
    }) => (checked ? legalApi.check(obligationId, month) : legalApi.uncheck(obligationId, month)),
  );
