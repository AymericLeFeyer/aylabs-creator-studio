import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  productionApi,
  productionSlotApi,
  productionStepApi,
  productionTimeApi,
  productionTodoApi,
  stepTodoApi,
  type ProductionListParams,
  type SlotListParams,
  type TimeListParams,
} from '../../../infrastructure/production/api/productionApi.ts';
import type { StepTodoInput } from '../../../domain/production/entities/StepTodo.ts';
import type { TimeEntryInput } from '../../../domain/production/entities/TimeEntry.ts';
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

/** File d'attente, alertes, créneaux à venir et charge de la semaine, en une requête. */
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

// --- Tâches d'étape ---------------------------------------------------------

/**
 * Le référentiel : les tâches habituelles d'une étape, configurées une fois pour toutes
 * les vidéos. Il change rarement — cache de 5 minutes, comme les étapes elles-mêmes.
 */
export const useStepTodos = (includeArchived = false) =>
  useQuery({
    queryKey: queryKeys.stepTodos(includeArchived),
    queryFn: () => stepTodoApi.list(includeArchived),
    staleTime: 5 * 60_000,
  });

/**
 * Écrire dans le référentiel change l'avancement de **toutes** les vidéos : une tâche
 * ajoutée rouvre les étapes qui la portaient pour terminée. Les productions repartent donc
 * avec le référentiel.
 */
const useStepTodoMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['stepTodos'] });
      for (const root of PRODUCTION_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const useCreateStepTodo = () =>
  useStepTodoMutation((input: StepTodoInput) => stepTodoApi.create(input));

export const useUpdateStepTodo = () =>
  useStepTodoMutation(
    ({ id, input }: { id: string; input: Partial<Omit<StepTodoInput, 'stepId'>> }) =>
      stepTodoApi.update(id, input),
  );

export const useDeleteStepTodo = () => useStepTodoMutation((id: string) => stepTodoApi.remove(id));

/** Les tâches d'une vidéo : référentiel et ponctuelles réunies, avec leur état. */
export const useProductionTodos = (productionId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.productionTodos(productionId ?? ''),
    queryFn: () => productionTodoApi.list(productionId!),
    enabled: Boolean(productionId),
  });

/**
 * Cocher une tâche peut cocher son étape : l'aperçu, la file et la fiche repartent
 * ensemble, et l'appel renvoie la liste que l'API vient de décider.
 */
export const useToggleTodo = () =>
  useProductionMutation(
    ({
      productionId,
      todoId,
      checked,
    }: {
      productionId: string;
      todoId: string;
      checked: boolean;
    }) => productionTodoApi.toggle(productionId, todoId, checked),
  );

export const useAddProductionTodo = () =>
  useProductionMutation(
    ({
      productionId,
      label,
      stepId,
    }: {
      productionId: string;
      label: string;
      stepId: string | null;
    }) => productionTodoApi.add(productionId, label, stepId),
  );

export const useDeleteProductionTodo = () =>
  useProductionMutation(({ productionId, todoId }: { productionId: string; todoId: string }) =>
    productionTodoApi.remove(productionId, todoId),
  );

// --- Suivi du temps ---------------------------------------------------------

export const useTimeEntries = (params: TimeListParams = {}) =>
  useQuery({
    queryKey: queryKeys.productionTime(params),
    queryFn: () => productionTimeApi.list(params),
    staleTime: 15_000,
  });

/**
 * Le chronomètre en cours.
 *
 * Il est aussi porté par `useProductionOverview` — celui-ci sert aux écrans qui n'ont
 * pas besoin de tout l'aperçu (la fiche d'une vidéo, la barre de l'en-tête). Rafraîchi
 * toutes les minutes : la durée affichée est recalculée en local à la seconde, mais un
 * arrêt fait depuis un autre onglet doit finir par se voir.
 */
export const useRunningTimer = () =>
  useQuery({
    queryKey: queryKeys.runningTimer(),
    queryFn: () => productionTimeApi.running(),
    refetchInterval: 60_000,
  });

/**
 * L'ordre des étapes et celui des tâches sont **globaux** : ils valent pour toutes les
 * vidéos. C'est voulu — une étape n'a qu'un rang, et le déplacer depuis une fiche revient
 * à le déplacer partout. Les écrans qui le proposent le disent.
 *
 * Ils passent par `useStepMutation` / `useStepTodoMutation` et **non** par
 * `useProductionMutation` : celui-ci n'invalide ni `productionSteps` ni `stepTodos`, si
 * bien que le nouvel ordre était bien écrit en base mais que l'écran continuait d'afficher
 * la liste servie par le cache — les flèches paraissaient ne rien faire.
 */
export const useReorderSteps = () =>
  useStepMutation((ids: string[]) => productionStepApi.reorder(ids));

export const useReorderStepTodos = () =>
  useStepTodoMutation((ids: string[]) => stepTodoApi.reorder(ids));

export const useStartTimer = () =>
  useProductionMutation(
    ({
      productionId,
      stepId,
      todoId,
    }: {
      productionId: string;
      stepId: string | null;
      todoId?: string | null;
    }) => productionTimeApi.start(productionId, stepId, todoId ?? null),
  );

/**
 * Arrête le chronomètre.
 *
 * `from` et `nowMinutes` sont transmis pour le replan que l'API déclenche quand la session
 * venait d'un créneau du planning — sans eux, il repartirait de l'horloge du serveur, qui
 * est en UTC.
 */
export const useStopTimer = () =>
  useProductionMutation((input: string | { id: string; from?: string; nowMinutes?: number }) =>
    typeof input === 'string'
      ? productionTimeApi.stop(input)
      : productionTimeApi.stop(input.id, { from: input.from, nowMinutes: input.nowMinutes }),
  );

export const useCreateTimeEntry = () =>
  useProductionMutation((input: TimeEntryInput) => productionTimeApi.create(input));

export const useUpdateTimeEntry = () =>
  useProductionMutation(
    ({ id, input }: { id: string; input: Partial<Omit<TimeEntryInput, 'productionId'>> }) =>
      productionTimeApi.update(id, input),
  );

export const useDeleteTimeEntry = () =>
  useProductionMutation((id: string) => productionTimeApi.remove(id));
