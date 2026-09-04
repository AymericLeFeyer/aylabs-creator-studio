import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { planningApi, type ReplanInput } from '../../../infrastructure/planning/api/planningApi.ts';
import { toTime } from '../../../domain/planning/entities/Planning.ts';
import type {
  ApproveSlotInput,
  PlanningSettingsInput,
  PlanTargetsInput,
  WorkHoursInput,
} from '../../../domain/planning/entities/Planning.ts';
import { PLANNING_ROOTS, queryKeys } from '../../queryKeys.ts';

/**
 * Toute écriture de planning invalide le module **et** celui de production.
 *
 * Ce n'est pas de la prudence : approuver un créneau enregistre une session de travail,
 * peut cocher une tâche, et fait donc bouger l'avancement de la file d'attente et le
 * compteur de temps de la fiche. Ne rafraîchir que la grille laisserait la file
 * annoncer un travail encore à faire.
 */
const usePlanningMutation = <TVariables, TData>(
  mutationFn: (variables: TVariables) => Promise<TData>,
) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: () => {
      for (const root of PLANNING_ROOTS) {
        void queryClient.invalidateQueries({ queryKey: [root] });
      }
    },
  });
};

/** La grille, ses occupations et la pile de travail, en une requête. */
export const usePlanningBoard = (from: string, to: string) =>
  useQuery({
    queryKey: queryKeys.planningBoard({ from, to }),
    queryFn: () => planningApi.board(from, to),
    // Le planning se lit à côté d'un agenda ouvert ailleurs : une donnée d'une minute
    // est déjà trop vieille pour décider quoi faire maintenant.
    staleTime: 30_000,
  });

export const usePlanningItems = () =>
  useQuery({
    queryKey: queryKeys.planningItems(),
    queryFn: () => planningApi.items(),
    staleTime: 30_000,
  });

export const usePlanningSettings = () =>
  useQuery({
    queryKey: queryKeys.planningSettings(),
    queryFn: () => planningApi.settings(),
    staleTime: 5 * 60_000,
  });

export const useWorkHours = () =>
  useQuery({
    queryKey: queryKeys.workHours(),
    queryFn: () => planningApi.workHours(),
    staleTime: 5 * 60_000,
  });

/**
 * Les calendriers de l'instance.
 *
 * `enabled` seulement quand une connexion est configurée : sans jeton, l'appel se
 * solderait par une erreur 400 à chaque ouverture de l'écran de réglages.
 */
export const useCalendars = (enabled: boolean) =>
  useQuery({
    queryKey: queryKeys.calendars(),
    queryFn: () => planningApi.calendars(),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });

export const useUpdatePlanningSettings = () =>
  usePlanningMutation((input: PlanningSettingsInput) => planningApi.updateSettings(input));

export const useReplaceWorkHours = () =>
  usePlanningMutation((ranges: WorkHoursInput[]) => planningApi.replaceWorkHours(ranges));

/** Met une vidéo au planning : les étapes et tâches cochées entrent dans la pile. */
export const useAddPlanTargets = () =>
  usePlanningMutation((input: PlanTargetsInput) => planningApi.addTargets(input));

export const useRemovePlanningItem = () =>
  usePlanningMutation((id: string) => planningApi.removeItem(id));

/**
 * Repositionne les créneaux suggérés — **le seul geste qui réécrit la journée**.
 *
 * Ajouter une vidéo, approuver un créneau ou arrêter un chronomètre se contentent de poser
 * ce qui manque, sans rien déplacer : réécrire un agenda est une décision, pas un effet de
 * bord.
 */
export const useReplan = () =>
  usePlanningMutation((input: ReplanInput) => planningApi.replan(input));

export const useApproveSlot = () =>
  usePlanningMutation((input: { slotId: string } & ApproveSlotInput) => {
    const { slotId, ...rest } = input;
    return planningApi.approve(slotId, rest);
  });

/**
 * Démarre le chronomètre sur un créneau proposé.
 *
 * À l'arrêt, ce créneau cessera d'être une suggestion : ses horaires seront recalés sur ce
 * qui s'est réellement passé. C'est l'autre chemin vers le même résultat qu'une
 * approbation — mesurer pendant, plutôt qu'estimer après.
 */
export const useStartSlotTimer = () =>
  usePlanningMutation((slotId: string) =>
    // Le jour et l'heure viennent du navigateur : le serveur tourne en UTC, et lui laisser
    // déduire « maintenant » poserait le créneau deux heures trop tôt en été.
    planningApi.startTimerOnSlot(slotId, localToday(), toTime(nowMinutes())),
  );

/** Matérialise une session de travail dans le planning, à l'heure où elle a eu lieu. */
export const useSlotFromTimeEntry = () =>
  usePlanningMutation((input: { timeEntryId: string; date: string; startTime: string }) =>
    planningApi.slotFromTimeEntry(input.timeEntryId, input.date, input.startTime),
  );

export const useUnapproveSlot = () =>
  usePlanningMutation((slotId: string) => planningApi.unapprove(slotId));

/**
 * L'heure locale du navigateur, en minutes depuis minuit.
 *
 * Envoyée à chaque replan : l'API tourne en UTC dans un conteneur, et s'y fier
 * proposerait un créneau à 9 h alors qu'il est midi.
 */
export const nowMinutes = (): number => {
  const now = new Date();
  return now.getHours() * 60 + now.getMinutes();
};

/** La date du jour **locale**, pour la même raison. */
export const localToday = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

/** Décale une date ISO de N jours, sans passer par un fuseau. */
export const shiftDate = (date: string, days: number): string => {
  const parsed = new Date(`${date}T12:00:00`);
  parsed.setDate(parsed.getDate() + days);
  return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
};

/** Le lundi de la semaine d'une date : la grille commence toujours un lundi. */
export const startOfWeek = (date: string): string => {
  const parsed = new Date(`${date}T12:00:00`);
  const weekday = (parsed.getDay() + 6) % 7;
  return shiftDate(date, -weekday);
};
