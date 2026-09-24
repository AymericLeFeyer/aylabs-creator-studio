import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateDashboardWidgetInput,
  DashboardWidget,
  UpdateDashboardWidgetInput,
} from '../../../domain/dashboard/entities/DashboardWidget.ts';
import type { DashboardWidgetRepository } from '../../../domain/dashboard/repositories/DashboardWidgetRepository.ts';
import { newId } from '../../../shared/id.ts';
import { conflict, notFound } from '../../../shared/errors.ts';

interface WidgetRow {
  id: string;
  block_id: string;
  title: string | null;
  description: string | null;
  icon: string | null;
  width: number;
  variant: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: WidgetRow): DashboardWidget => ({
  id: row.id,
  blockId: row.block_id,
  title: row.title,
  description: row.description,
  icon: row.icon,
  width: row.width,
  variant: row.variant,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** CRUD nu, sans use case : poser un bloc sur le dashboard n'a aucun effet de bord. */
export class SqliteDashboardWidgetRepository implements DashboardWidgetRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(): DashboardWidget[] {
    const rows = this.db
      .prepare('SELECT * FROM dashboard_widgets ORDER BY sort_order, created_at')
      .all() as unknown as WidgetRow[];
    return rows.map(toDomain);
  }

  private findById(id: string): DashboardWidget {
    const row = this.db.prepare('SELECT * FROM dashboard_widgets WHERE id = ?').get(id) as
      WidgetRow | undefined;
    if (!row) throw notFound('Bloc du dashboard');
    return toDomain(row);
  }

  create(input: CreateDashboardWidgetInput): DashboardWidget {
    const existing = this.db
      .prepare('SELECT id FROM dashboard_widgets WHERE block_id = ?')
      .get(input.blockId);
    if (existing) throw conflict('Ce bloc est déjà sur le dashboard');

    const id = newId();
    const now = new Date().toISOString();
    const { next } = this.db
      .prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM dashboard_widgets')
      .get() as { next: number };
    this.db
      .prepare(
        `INSERT INTO dashboard_widgets
           (id, block_id, title, icon, variant, width, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.blockId,
        input.title ?? null,
        input.icon ?? null,
        input.variant ?? null,
        input.width ?? 1,
        next,
        now,
        now,
      );
    return this.findById(id);
  }

  update(id: string, input: UpdateDashboardWidgetInput): DashboardWidget {
    const current = this.findById(id);
    // `undefined` conserve, `null` rend la valeur d'origine du bloc.
    const pick = <T>(value: T | undefined, fallback: T): T =>
      value === undefined ? fallback : value;
    this.db
      .prepare(
        `UPDATE dashboard_widgets
            SET title = ?, description = ?, icon = ?, width = ?, variant = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(
        pick(input.title, current.title),
        pick(input.description, current.description),
        pick(input.icon, current.icon),
        pick(input.width, current.width),
        pick(input.variant, current.variant),
        new Date().toISOString(),
        id,
      );
    return this.findById(id);
  }

  delete(id: string): void {
    this.db.prepare('DELETE FROM dashboard_widgets WHERE id = ?').run(id);
  }

  reorder(ids: string[]): DashboardWidget[] {
    const stmt = this.db.prepare('UPDATE dashboard_widgets SET sort_order = ? WHERE id = ?');
    this.db.exec('BEGIN');
    try {
      ids.forEach((id, index) => stmt.run(index + 1, id));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.findAll();
  }
}
