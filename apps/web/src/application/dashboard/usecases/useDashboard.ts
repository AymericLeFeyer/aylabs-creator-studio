import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { dashboardApi } from '../../../infrastructure/dashboard/api/dashboardApi.ts';
import type {
  DashboardWidget,
  DashboardWidgetCreate,
  DashboardWidgetUpdate,
} from '../../../domain/dashboard/entities/DashboardWidget.ts';
import { queryKeys } from '../../queryKeys.ts';

/**
 * Relecture toutes les 15 s, et au retour sur l'onglet : c'est ce qui fait apparaître sur
 * l'ordinateur un bloc ajouté depuis le téléphone. La base est la seule source ; aucune
 * connexion permanente (WebSocket, SSE) n'est tenue pour une liste qui change quelques fois
 * par semaine — et qui passerait mal le proxy nginx.
 */
const REFRESH_MS = 15_000;

const MUTATION_KEY = ['dashboardWidgets', 'write'] as const;

export const useDashboardWidgets = () =>
  useQuery({
    queryKey: queryKeys.dashboardWidgets(),
    queryFn: () => dashboardApi.list(),
    staleTime: 5_000,
    refetchInterval: REFRESH_MS,
    refetchOnWindowFocus: true,
  });

/**
 * Toutes les écritures sont **optimistes** : l'icône d'ajout se remplit au clic, un bloc
 * glissé reste où on l'a lâché. La liste n'est relue qu'une fois la **dernière** écriture
 * en vol terminée — une relecture intermédiaire (ou la relecture périodique) ramènerait un
 * état qui ne connaît pas encore les gestes suivants, et le bloc sauterait en arrière.
 */
const useWidgetMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  apply: (widgets: DashboardWidget[], variables: TVariables) => DashboardWidget[],
) => {
  const queryClient = useQueryClient();
  const key = queryKeys.dashboardWidgets();
  return useMutation({
    mutationKey: MUTATION_KEY,
    mutationFn,
    onMutate: async (variables: TVariables) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<DashboardWidget[]>(key);
      queryClient.setQueryData<DashboardWidget[]>(key, (widgets) =>
        apply(widgets ?? [], variables),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: MUTATION_KEY }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
};

export const useAddWidget = () =>
  useWidgetMutation(
    (input: DashboardWidgetCreate) => dashboardApi.create(input),
    (widgets, input) => [
      ...widgets,
      {
        // Identifiant provisoire : remplacé à la relecture, jamais envoyé à l'API.
        id: `pending:${input.blockId}`,
        blockId: input.blockId,
        title: input.title ?? null,
        description: null,
        icon: input.icon ?? null,
        width: input.width ?? 1,
        variant: input.variant ?? null,
        sortOrder: widgets.length + 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  );

export const useUpdateWidget = () =>
  useWidgetMutation(
    ({ id, input }: { id: string; input: DashboardWidgetUpdate }) => dashboardApi.update(id, input),
    (widgets, { id, input }) =>
      widgets.map((widget) => (widget.id === id ? { ...widget, ...input } : widget)),
  );

export const useRemoveWidget = () =>
  useWidgetMutation(
    (id: string) => dashboardApi.remove(id),
    (widgets, id) => widgets.filter((widget) => widget.id !== id),
  );

export const useReorderWidgets = () =>
  useWidgetMutation(
    (ids: string[]) => dashboardApi.reorder(ids),
    (widgets, ids) =>
      ids
        .map((id) => widgets.find((widget) => widget.id === id))
        .filter((widget): widget is DashboardWidget => widget !== undefined)
        .map((widget, index) => ({ ...widget, sortOrder: index + 1 })),
  );
