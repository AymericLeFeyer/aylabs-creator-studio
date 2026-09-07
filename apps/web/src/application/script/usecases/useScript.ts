import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  productionShotAngleApi,
  scriptPresetApi,
  shotAngleApi,
} from '../../../infrastructure/script/api/scriptApi.ts';
import type { ScriptPresetInput } from '../../../domain/script/entities/ScriptPreset.ts';
import type { ShotAngleInput } from '../../../domain/script/entities/ShotAngle.ts';
import { SCRIPT_ROOTS, queryKeys } from '../../queryKeys.ts';

/**
 * Les référentiels du script se lisent souvent et changent rarement : même `staleTime`
 * que les étapes et les tâches, cinq minutes.
 */
const REFERENTIAL_STALE = 5 * 60_000;

export const useScriptPresets = (includeArchived = false) =>
  useQuery({
    queryKey: queryKeys.scriptPresets(includeArchived),
    queryFn: () => scriptPresetApi.list(includeArchived),
    staleTime: REFERENTIAL_STALE,
  });

export const useShotAngles = (includeArchived = false) =>
  useQuery({
    queryKey: queryKeys.shotAngles(includeArchived),
    queryFn: () => shotAngleApi.list(includeArchived),
    staleTime: REFERENTIAL_STALE,
  });

/**
 * Les angles proposés sur une vidéo. Sans production — le script d'une sponso qui n'en a
 * aucune — on retombe sur le référentiel seul : il n'y a alors aucune fiche à laquelle
 * rattacher un angle ponctuel.
 */
export const useProductionShotAngles = (productionId: string | undefined) => {
  const global = useShotAngles();
  const scoped = useQuery({
    queryKey: queryKeys.productionShotAngles(productionId ?? ''),
    queryFn: () => productionShotAngleApi.list(productionId!),
    enabled: Boolean(productionId),
    staleTime: REFERENTIAL_STALE,
  });

  if (!productionId) {
    return {
      ...global,
      data: global.data?.map((angle) => ({
        id: angle.id,
        label: angle.label,
        description: angle.description,
        color: angle.color,
        origin: 'global' as const,
        sortOrder: angle.sortOrder,
      })),
    };
  }
  return scoped;
};

/**
 * Écrire dans un référentiel de script ne touche **rien d'autre**.
 *
 * Ni l'argent, ni la file de production, ni les alertes : un gabarit est copié à
 * l'insertion et un angle posé dans un script y laisse une copie de son libellé et de sa
 * couleur. Aucune racine de production à invalider, donc — c'est la contrepartie assumée
 * du choix de tout copier plutôt que de tout référencer.
 */
const useScriptMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const root of SCRIPT_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

export const useCreateScriptPreset = () =>
  useScriptMutation((input: ScriptPresetInput) => scriptPresetApi.create(input));

export const useUpdateScriptPreset = () =>
  useScriptMutation(
    ({ id, input }: { id: string; input: Partial<ScriptPresetInput> & { isArchived?: boolean } }) =>
      scriptPresetApi.update(id, input),
  );

export const useDeleteScriptPreset = () =>
  useScriptMutation((id: string) => scriptPresetApi.remove(id));

export const useReorderScriptPresets = () =>
  useScriptMutation((ids: string[]) => scriptPresetApi.reorder(ids));

export const useCreateShotAngle = () =>
  useScriptMutation((input: ShotAngleInput) => shotAngleApi.create(input));

export const useUpdateShotAngle = () =>
  useScriptMutation(
    ({ id, input }: { id: string; input: Partial<ShotAngleInput> & { isArchived?: boolean } }) =>
      shotAngleApi.update(id, input),
  );

export const useDeleteShotAngle = () => useScriptMutation((id: string) => shotAngleApi.remove(id));

export const useReorderShotAngles = () =>
  useScriptMutation((ids: string[]) => shotAngleApi.reorder(ids));

/**
 * Créer un angle **pour cette vidéo seulement**, depuis l'éditeur.
 *
 * La création ne demande que le nom — la couleur vient de la rotation côté API, comme
 * pour une marque créée à la volée : demander une teinte au moment où l'on écrit ferait
 * renoncer à créer l'angle, et c'est exactement le geste qu'on veut rendre gratuit.
 */
export const useCreateProductionShotAngle = () =>
  useScriptMutation(({ productionId, input }: { productionId: string; input: ShotAngleInput }) =>
    productionShotAngleApi.create(productionId, input),
  );

export const useDeleteProductionShotAngle = () =>
  useScriptMutation(({ productionId, angleId }: { productionId: string; angleId: string }) =>
    productionShotAngleApi.remove(productionId, angleId),
  );
