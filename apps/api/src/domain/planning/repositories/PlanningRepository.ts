import type { IsoDate } from '../../../shared/dates.ts';
import type {
  CreatePlanningItemInput,
  PlanningItem,
  PlanningItemStatus,
  PlanningItemView,
} from '../entities/PlanningItem.ts';
import type { PlanningSettings, PlanningSettingsInput } from '../entities/PlanningSettings.ts';
import type { WorkHours, WorkHoursInput } from '../entities/WorkHours.ts';

export interface WorkHoursRepository {
  findAll(): WorkHours[];
  /**
   * Réécrit **toute** la grille d'un coup : le formulaire envoie l'état complet de la
   * semaine, et une fusion rendrait impossible la suppression d'une plage.
   */
  replaceAll(input: WorkHoursInput[]): WorkHours[];
}

export interface PlanningSettingsRepository {
  get(): PlanningSettings;
  /** Le jeton absent est conservé, `""` l'efface — même convention que `refreshToken`. */
  update(input: PlanningSettingsInput): PlanningSettings;
  /** Le jeton en clair, réservé au client HTTP. Il ne sort jamais par une route. */
  token(): string | null;
}

export interface PlanningItemFilter {
  productionIds?: string[];
  statuses?: PlanningItemStatus[];
}

export interface PlanningItemRepository {
  findAll(filter?: PlanningItemFilter): PlanningItemView[];
  findById(id: string): PlanningItem | null;
  /** Idempotent : remettre la même tâche dans la pile la rouvre au lieu d'échouer. */
  create(input: CreatePlanningItemInput): PlanningItem;
  update(
    id: string,
    input: Partial<Pick<PlanningItem, 'label' | 'plannedMinutes' | 'sequence' | 'status'>>,
  ): PlanningItem;
  delete(id: string): void;
  /** Ferme les lignes d'une tâche cochée. Appelée par `ManageTodos`, jamais par une route. */
  closeForTodo(productionId: string, todoId: string): void;
  /** Ferme la ligne d'une étape entière (celle qui n'a pas de tâche). */
  closeForStep(productionId: string, stepId: string): void;
  /** Rouvre ce qu'une décoche vient de rendre à faire. */
  reopenForTodo(productionId: string, todoId: string): void;
  reopenForStep(productionId: string, stepId: string): void;
  /** Prochain rang libre : une nouvelle vidéo entre en fin de pile. */
  nextSequence(): number;
}

export interface CalendarRange {
  from: IsoDate;
  to: IsoDate;
}
