import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { legalApi } from '../../../infrastructure/legal/api/legalApi.ts';
import type {
  CompanyInput,
  LegalBookmarkInput,
  LegalObligationInput,
} from '../../../domain/legal/entities/Legal.ts';
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

/**
 * Les liens utiles. Requête à part de l'aperçu : ils ne dépendent ni du mois ni des
 * cases, et changent une fois par an — d'où le cache long, comme les autres référentiels.
 */
export const useLegalBookmarks = (includeArchived = false) =>
  useQuery({
    queryKey: queryKeys.legalBookmarks(includeArchived),
    queryFn: () => legalApi.listBookmarks(includeArchived),
    staleTime: 5 * 60_000,
  });

/**
 * Écrire un favori n'invalide que les favoris : contrairement à une obligation, il ne
 * touche ni au tableau mensuel, ni aux alertes, ni au dashboard. Repartir sur
 * `LEGAL_ROOTS` ferait clignoter tout l'écran pour un changement de libellé.
 */
const useBookmarkMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['legalBookmarks'] });
    },
  });
};

export const useCreateBookmark = () =>
  useBookmarkMutation((input: LegalBookmarkInput) => legalApi.createBookmark(input));

export const useUpdateBookmark = () =>
  useBookmarkMutation(({ id, input }: { id: string; input: Partial<LegalBookmarkInput> }) =>
    legalApi.updateBookmark(id, input),
  );

export const useDeleteBookmark = () =>
  useBookmarkMutation((id: string) => legalApi.removeBookmark(id));
