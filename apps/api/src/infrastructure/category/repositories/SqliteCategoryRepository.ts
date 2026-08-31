import type { DatabaseSync } from 'node:sqlite';
import type {
  Category,
  CreateCategoryInput,
  UpdateCategoryInput,
} from '../../../domain/category/entities/Category.ts';
import { acceptsExpense, acceptsRevenue } from '../../../domain/category/entities/Category.ts';
import type {
  CategoryFilter,
  CategoryRepository,
} from '../../../domain/category/repositories/CategoryRepository.ts';
import { fromSqlBool, toSqlBool } from '../../db/database.ts';
import { newId } from '../../../shared/id.ts';
import { conflict, notFound } from '../../../shared/errors.ts';

interface CategoryRow {
  id: string;
  name: string;
  nature: string;
  scope: string;
  color: string;
  is_auto: number;
  is_archived: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  nature: row.nature as Category['nature'],
  scope: row.scope as Category['scope'],
  color: row.color,
  isAuto: fromSqlBool(row.is_auto),
  isArchived: fromSqlBool(row.is_archived),
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqliteCategoryRepository implements CategoryRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(filter: CategoryFilter = {}): Category[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (!filter.includeArchived) conditions.push('is_archived = 0');
    // `both` répond des deux côtés : on filtre sur le scope demandé OU 'both'.
    if (filter.scope && filter.scope !== 'both') {
      conditions.push("(scope = ? OR scope = 'both')");
      params.push(filter.scope);
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM categories ${clause} ORDER BY sort_order, name COLLATE NOCASE`)
      .all(...(params as never[])) as unknown as CategoryRow[];

    return rows.map(toDomain);
  }

  findById(id: string): Category | null {
    const row = this.db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as
      CategoryRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateCategoryInput): Category {
    const id = newId();
    const now = new Date().toISOString();
    const maxOrder = (
      this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM categories').get() as {
        n: number;
      }
    ).n;

    this.db
      .prepare(
        `INSERT INTO categories
           (id, name, nature, scope, color, is_auto, is_archived, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.nature,
        input.scope ?? 'revenue',
        input.color ?? '#64748b',
        input.sortOrder ?? maxOrder + 1,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateCategoryInput): Category {
    const existing = this.findById(id);
    if (!existing) throw notFound('Catégorie');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.name !== undefined) set('name', input.name);
    if (input.color !== undefined) set('color', input.color);
    if (input.sortOrder !== undefined) set('sort_order', input.sortOrder);
    if (input.isArchived !== undefined) set('is_archived', toSqlBool(input.isArchived));
    // Changer la nature d'une catégorie déjà utilisée déplacerait tout son historique
    // entre le cash et l'en nature : on l'autorise, mais jamais sur AdSense.
    if (input.nature !== undefined && input.nature !== existing.nature) {
      if (existing.isAuto) throw conflict("La nature d'une catégorie automatique est figée");
      set('nature', input.nature);
    }
    if (input.scope !== undefined && input.scope !== existing.scope) {
      if (existing.isAuto) throw conflict("Le champ d'une catégorie automatique est figé");
      this.assertScopeStillFits(id, input.scope);
      set('scope', input.scope);
    }

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  delete(id: string): void {
    const existing = this.findById(id);
    if (!existing) throw notFound('Catégorie');
    if (existing.isAuto) throw conflict('La catégorie AdSense ne peut pas être supprimée');
    if (this.countEntries(id) > 0) {
      throw conflict(
        'Cette catégorie contient des écritures. Archive-la plutôt que de la supprimer.',
      );
    }
    this.db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  }

  countEntries(categoryId: string): number {
    return this.countRevenues(categoryId) + this.countExpenses(categoryId);
  }

  /**
   * Interdit de retirer un côté encore utilisé : passer « Matériel » de `both` à
   * `revenue` laisserait des dépenses rattachées à une catégorie qui ne les accepte plus.
   */
  private assertScopeStillFits(categoryId: string, scope: Category['scope']): void {
    if (!acceptsRevenue(scope) && this.countRevenues(categoryId) > 0) {
      throw conflict('Des revenus utilisent déjà cette catégorie : elle doit rester côté revenus.');
    }
    if (!acceptsExpense(scope) && this.countExpenses(categoryId) > 0) {
      throw conflict(
        'Des dépenses utilisent déjà cette catégorie : elle doit rester côté dépenses.',
      );
    }
  }

  private countRevenues(categoryId: string): number {
    return (
      this.db
        .prepare('SELECT COUNT(*) AS n FROM revenue_entries WHERE category_id = ?')
        .get(categoryId) as { n: number }
    ).n;
  }

  private countExpenses(categoryId: string): number {
    return (
      this.db
        .prepare('SELECT COUNT(*) AS n FROM expense_entries WHERE category_id = ?')
        .get(categoryId) as { n: number }
    ).n;
  }
}
