import type {
  CreateDashboardWidgetInput,
  DashboardWidget,
  UpdateDashboardWidgetInput,
} from '../entities/DashboardWidget.ts';

export interface DashboardWidgetRepository {
  /** Dans l'ordre d'affichage. */
  findAll(): DashboardWidget[];
  /** En fin de dashboard. 409 si le bloc y est déjà : un bloc n'y figure qu'une fois. */
  create(input: CreateDashboardWidgetInput): DashboardWidget;
  update(id: string, input: UpdateDashboardWidgetInput): DashboardWidget;
  delete(id: string): void;
  /** Réécrit l'ordre en entier (`1..n`), comme les référentiels. Rend la liste. */
  reorder(ids: string[]): DashboardWidget[];
}
