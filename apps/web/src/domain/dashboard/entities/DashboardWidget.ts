/**
 * Un bloc posé sur le dashboard — contrat dupliqué de l'API.
 *
 * Le dashboard ne possède aucune donnée : `blockId` désigne un bloc du catalogue
 * (`presentation/dashboard/registry.ts`), qui continue de vivre sur sa page d'origine.
 * `title` / `description` / `icon` à `null` = ceux du bloc d'origine.
 */
export interface DashboardWidget {
  id: string;
  blockId: string;
  title: string | null;
  description: string | null;
  icon: string | null;
  /** Colonnes occupées sur une grille de 6, au large. */
  width: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardWidgetUpdate {
  title?: string | null;
  description?: string | null;
  icon?: string | null;
  width?: number;
}

export const WIDGET_WIDTHS = [1, 2, 3, 4, 5, 6] as const;
