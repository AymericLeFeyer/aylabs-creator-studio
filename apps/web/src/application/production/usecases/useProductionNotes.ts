import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productionNoteApi } from '../../../infrastructure/production/api/productionNoteApi.ts';
import type {
  ProductionNote,
  ProductionNoteInput,
} from '../../../domain/production/entities/ProductionNote.ts';
import { queryKeys } from '../../queryKeys.ts';

/**
 * Les notes d'une vidéo. Aucun effet de bord : ni l'avancement, ni l'argent, ni le
 * planning n'en dépendent, seule leur propre liste bouge.
 */
export const useProductionNotes = (productionId: string | undefined) =>
  useQuery({
    queryKey: queryKeys.productionNotes(productionId ?? ''),
    queryFn: () => productionNoteApi.list(productionId!),
    enabled: Boolean(productionId),
    staleTime: 30_000,
  });

const useNoteMutation = <TVariables, TData>(
  productionId: string,
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.productionNotes(productionId) });
    },
  });
};

export const useCreateProductionNote = (productionId: string) =>
  useNoteMutation(productionId, (input: ProductionNoteInput) =>
    productionNoteApi.create(productionId, input),
  );

export const useDeleteProductionNote = (productionId: string) =>
  useNoteMutation(productionId, (id: string) => productionNoteApi.remove(productionId, id));

/**
 * Modifier une note **écrit la réponse dans le cache au lieu de relire la liste**.
 *
 * Le contenu s'enregistre tout seul pendant qu'on tape : une relecture par envoi ferait
 * un aller-retour de plus à chaque pause de frappe, pour rapporter ce qu'on vient
 * d'envoyer. La réponse suffit à mettre à jour le titre et la date de la liste.
 */
export const useUpdateProductionNote = (productionId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: ProductionNoteInput }) =>
      productionNoteApi.update(productionId, id, input),
    onSuccess: (note) => {
      queryClient.setQueryData<ProductionNote[]>(queryKeys.productionNotes(productionId), (notes) =>
        notes?.map((item) => (item.id === note.id ? note : item)),
      );
    },
  });
};
