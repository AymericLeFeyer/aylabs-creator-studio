import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  productionApi,
  productionSlotApi,
  productionStepApi,
  type ProductionListParams,
  type SlotListParams,
} from '../../../infrastructure/production/api/productionApi.ts';
import type { ProductionInput } from '../../../domain/production/entities/Production.ts';
import type { ProductionSlotInput } from '../../../domain/production/entities/ProductionSlot.ts';
import type { ProductionStepInput } from '../../../domain/production/entities/ProductionStep.ts';
import { PARTNER_ROOTS, PRODUCTION_ROOTS, queryKeys } from '../../queryKeys.ts';

/**
 * Toute écriture de production invalide l'ensemble du module.
 *
 * Découper plus finement demanderait de savoir, à l'appel, si le changement touche les
 * alertes, les compteurs de la file ou le planning — trois vues qu'un seul changement
 * de statut peut faire bouger. Le module est petit, le refetch est bon marché.
 */
const useProductionMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  /** `true` quand l'écriture peut déplacer de l'argent (publication : les revenus
   *  générés changent de vidéo rattachée). */
  touchesMoney = false,
) => {
  const queryClient = useQueryClient();
  const roots = touchesMoney ? PARTNER_ROOTS : PRODUCTION_ROOTS;

  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const root of roots) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const useProductions = (params: ProductionListParams = {}) =>
  useQuery({
    queryKey: queryKeys.productions(params),
    queryFn: () => productionApi.list(params),
    staleTime: 15_000,
  });

export const useProduction = (id: string | undefined) =>
  useQuery({
    queryKey: queryKeys.production(id ?? ''),
    queryFn: () => productionApi.get(id!),
    enabled: Boolean(id),
  });

/** File d'attente, alertes, suggestions et charge de la semaine, en une requête. */
export const useProductionOverview = () =>
  useQuery({
    queryKey: queryKeys.productionOverview(),
    queryFn: () => productionApi.overview(),
    staleTime: 15_000,
  });

export const useCreateProduction = () =>
  useProductionMutation((input: ProductionInput) => productionApi.create(input));

export const useUpdateProduction = () =>
  useProductionMutation(
    ({ id, input }: { id: string; input: Partial<ProductionInput> }) =>
      productionApi.update(id, input),
    // Changer la chaîne ou la vidéo re-synchronise les revenus des produits et sponsos.
    true,
  );

export const useDeleteProduction = () =>
  useProductionMutation((id: string) => productionApi.remove(id), true);

export const useReorderProductions = () =>
  useProductionMutation((ids: string[]) => productionApi.reorder(ids));

export const usePublishProduction = () =>
  useProductionMutation(
    ({ id, videoId }: { id: string; videoId: string }) => productionApi.publish(id, videoId),
    true,
  );

/** Coche ou décoche une étape. Le booléen dit l'état **voulu**, pas l'état courant. */
export const useToggleStep = () =>
  useProductionMutation(
    ({ id, stepId, checked }: { id: string; stepId: string; checked: boolean }) =>
      checked ? productionApi.checkStep(id, stepId) : productionApi.uncheckStep(id, stepId),
  );

// --- Référentiel des étapes -------------------------------------------------

const useStepMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      // Les étapes dessinent les pastilles de chaque carte : les productions repartent aussi.
      void queryClient.invalidateQueries({ queryKey: ['productionSteps'] });
      void queryClient.invalidateQueries({ queryKey: ['productions'] });
      void queryClient.invalidateQueries({ queryKey: ['productionOverview'] });
    },
  });
};

export const useProductionSteps = (includeArchived = false) =>
  useQuery({
    queryKey: queryKeys.productionSteps(includeArchived),
    queryFn: () => productionStepApi.list(includeArchived),
    staleTime: 5 * 60_000,
  });

export const useCreateStep = () =>
  useStepMutation((input: ProductionStepInput) => productionStepApi.create(input));

export const useUpdateStep = () =>
  useStepMutation(({ id, input }: { id: string; input: Partial<ProductionStepInput> }) =>
    productionStepApi.update(id, input),
  );

export const useDeleteStep = () => useStepMutation((id: string) => productionStepApi.remove(id));

// --- Créneaux ---------------------------------------------------------------

export const useProductionSlots = (params: SlotListParams = {}) =>
  useQuery({
    queryKey: queryKeys.productionSlots(params),
    queryFn: () => productionSlotApi.list(params),
    staleTime: 15_000,
  });

export const useCreateSlot = () =>
  useProductionMutation((input: ProductionSlotInput) => productionSlotApi.create(input));

export const useUpdateSlot = () =>
  useProductionMutation(
    ({ id, input }: { id: string; input: Partial<Omit<ProductionSlotInput, 'productionId'>> }) =>
      productionSlotApi.update(id, input),
  );

export const useDeleteSlot = () =>
  useProductionMutation((id: string) => productionSlotApi.remove(id));
