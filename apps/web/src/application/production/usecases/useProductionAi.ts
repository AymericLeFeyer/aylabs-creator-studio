import { useMutation, useQueryClient } from '@tanstack/react-query';
import { productionApi } from '../../../infrastructure/production/api/productionApi.ts';

/**
 * L'IA d'une fiche de production. Des mutations et non des requêtes : chaque appel coûte des
 * crédits et ne part que sur un geste. Rien n'est écrit sur la production, seul le solde
 * affiché bouge — d'où l'invalidation de `aiSettings`, et de lui seul.
 */
const useAiMutation = <Input, Output>(mutationFn: (input: Input) => Promise<Output>) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['aiSettings'] }),
  });
};

export const useAiScript = () =>
  useAiMutation(
    ({
      productionId,
      ...input
    }: {
      productionId: string;
      prompt: string;
      script: string;
      selection: string | null;
    }) => productionApi.aiScript(productionId, input),
  );

export const useAiTitles = () =>
  useAiMutation(({ productionId, avoid }: { productionId: string; avoid: string[] }) =>
    productionApi.aiTitles(productionId, avoid),
  );

export const useAiTags = () =>
  useAiMutation((productionId: string) => productionApi.aiTags(productionId));

export const useAiDescription = () =>
  useAiMutation(({ productionId, avoid }: { productionId: string; avoid: string[] }) =>
    productionApi.aiDescription(productionId, avoid),
  );
