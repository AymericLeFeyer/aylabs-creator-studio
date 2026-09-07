import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateProductionShotAngleInput,
  CreateShotAngleInput,
  ProductionShotAngle,
  ShotAngle,
  ShotAngleItem,
  UpdateProductionShotAngleInput,
  UpdateShotAngleInput,
} from '../../../domain/script/entities/ShotAngle.ts';
import type { ShotAngleRepository } from '../../../domain/script/repositories/ScriptRepository.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

/**
 * La couleur est ce qui se lit dans le script, pas l'identifiant : elle est donc
 * attribuée en rotation, comme pour les marques. Une teinte par défaut unique rendrait
 * six angles indistinguables — et l'angle de vue ne sert qu'à être reconnu d'un regard.
 */
const DEFAULT_COLORS = [
  '#3b82f6',
  '#f59e0b',
  '#a855f7',
  '#22c55e',
  '#ec4899',
  '#14b8a6',
  '#ef4444',
  '#f97316',
];

interface GlobalRow {
  id: string;
  label: string;
  description: string | null;
  color: string;
  sort_order: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

interface ProductionRow extends Omit<GlobalRow, 'is_archived'> {
  production_id: string;
}

const toGlobal = (row: GlobalRow): ShotAngle => ({
  id: row.id,
  label: row.label,
  description: row.description,
  color: row.color,
  sortOrder: row.sort_order,
  isArchived: row.is_archived === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toProduction = (row: ProductionRow): ProductionShotAngle => ({
  id: row.id,
  productionId: row.production_id,
  label: row.label,
  description: row.description,
  color: row.color,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Un seul dépôt pour les deux origines, comme celui des tâches. */
export class SqliteShotAngleRepository implements ShotAngleRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private nextColor(table: 'shot_angles' | 'production_shot_angles'): string {
    const { n } = this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    return DEFAULT_COLORS[n % DEFAULT_COLORS.length]!;
  }

  findGlobal(includeArchived = false): ShotAngle[] {
    const clause = includeArchived ? '' : 'WHERE is_archived = 0';
    const rows = this.db
      .prepare(`SELECT * FROM shot_angles ${clause} ORDER BY sort_order, label`)
      .all() as unknown as GlobalRow[];
    return rows.map(toGlobal);
  }

  findGlobalById(id: string): ShotAngle | null {
    const row = this.db.prepare('SELECT * FROM shot_angles WHERE id = ?').get(id) as
      GlobalRow | undefined;
    return row ? toGlobal(row) : null;
  }

  createGlobal(input: CreateShotAngleInput): ShotAngle {
    const id = newId();
    const now = new Date().toISOString();
    const nextOrder =
      input.sortOrder ??
      (
        this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM shot_angles').get() as {
          n: number;
        }
      ).n + 1;

    this.db
      .prepare(
        `INSERT INTO shot_angles
           (id, label, description, color, sort_order, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        id,
        input.label,
        input.description ?? null,
        input.color ?? this.nextColor('shot_angles'),
        nextOrder,
        now,
        now,
      );

    return this.findGlobalById(id)!;
  }

  updateGlobal(id: string, input: UpdateShotAngleInput): ShotAngle {
    const existing = this.findGlobalById(id);
    if (!existing) throw notFound('Angle de vue');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.label !== undefined) set('label', input.label);
    if (input.description !== undefined) set('description', input.description);
    if (input.color !== undefined) set('color', input.color);
    if (input.sortOrder !== undefined) set('sort_order', input.sortOrder);
    if (input.isArchived !== undefined) set('is_archived', input.isArchived ? 1 : 0);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE shot_angles SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findGlobalById(id)!;
  }

  reorderGlobal(ids: string[]): void {
    if (ids.length === 0) return;
    const stmt = this.db.prepare('UPDATE shot_angles SET sort_order = ? WHERE id = ?');

    this.db.exec('BEGIN');
    try {
      ids.forEach((id, index) => stmt.run(index + 1, id));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Suppression **franche**, comme celle d'un gabarit.
   *
   * Les passages déjà marqués dans un script portent une copie du libellé et de la
   * couleur : ils gardent leur teinte et leur nom, l'angle cesse simplement d'être
   * proposé. C'est précisément ce que permet de ne stocker aucune clé étrangère dans le
   * HTML du script — un script reste lisible tout seul.
   */
  deleteGlobal(id: string): void {
    const result = this.db.prepare('DELETE FROM shot_angles WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Angle de vue');
  }

  findForProduction(productionId: string): ProductionShotAngle[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM production_shot_angles
          WHERE production_id = ?
          ORDER BY sort_order, label`,
      )
      .all(productionId) as unknown as ProductionRow[];
    return rows.map(toProduction);
  }

  private findProductionAngle(id: string): ProductionShotAngle | null {
    const row = this.db.prepare('SELECT * FROM production_shot_angles WHERE id = ?').get(id) as
      ProductionRow | undefined;
    return row ? toProduction(row) : null;
  }

  createForProduction(input: CreateProductionShotAngleInput): ProductionShotAngle {
    const id = newId();
    const now = new Date().toISOString();
    const { n } = this.db
      .prepare(
        'SELECT COALESCE(MAX(sort_order), 0) AS n FROM production_shot_angles WHERE production_id = ?',
      )
      .get(input.productionId) as { n: number };

    this.db
      .prepare(
        `INSERT INTO production_shot_angles
           (id, production_id, label, description, color, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.productionId,
        input.label,
        input.description ?? null,
        input.color ?? this.nextColor('production_shot_angles'),
        n + 1,
        now,
        now,
      );

    return this.findProductionAngle(id)!;
  }

  updateForProduction(id: string, input: UpdateProductionShotAngleInput): ProductionShotAngle {
    const existing = this.findProductionAngle(id);
    if (!existing) throw notFound('Angle de vue');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.label !== undefined) set('label', input.label);
    if (input.description !== undefined) set('description', input.description);
    if (input.color !== undefined) set('color', input.color);
    if (input.sortOrder !== undefined) set('sort_order', input.sortOrder);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE production_shot_angles SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findProductionAngle(id)!;
  }

  deleteForProduction(id: string): void {
    const result = this.db.prepare('DELETE FROM production_shot_angles WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Angle de vue');
  }

  listItems(productionId?: string): ShotAngleItem[] {
    const global: ShotAngleItem[] = this.findGlobal().map((angle) => ({
      id: angle.id,
      label: angle.label,
      description: angle.description,
      color: angle.color,
      origin: 'global',
      sortOrder: angle.sortOrder,
    }));

    if (!productionId) return global;

    const local: ShotAngleItem[] = this.findForProduction(productionId).map((angle) => ({
      id: angle.id,
      label: angle.label,
      description: angle.description,
      color: angle.color,
      origin: 'production',
      sortOrder: angle.sortOrder,
    }));

    // Le référentiel d'abord, le ponctuel ensuite : on cherche presque toujours un angle
    // habituel, et le mélanger aux quelques angles d'une vidéo ferait relire toute la liste.
    return [...global, ...local];
  }
}
