import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateProductionTodoInput,
  CreateStepTodoInput,
  ProductionTodo,
  StepTodo,
  TodoItem,
  UpdateProductionTodoInput,
  UpdateStepTodoInput,
} from '../../../domain/production/entities/StepTodo.ts';
import { placeholders } from '../../db/filters.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface StepTodoRow {
  id: string;
  step_id: string;
  label: string;
  default_minutes: number | null;
  sort_order: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

interface ProductionTodoRow {
  id: string;
  production_id: string;
  step_id: string | null;
  label: string;
  default_minutes: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const toStepTodo = (row: StepTodoRow): StepTodo => ({
  id: row.id,
  stepId: row.step_id,
  label: row.label,
  defaultMinutes: row.default_minutes,
  sortOrder: row.sort_order,
  isArchived: row.is_archived === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toProductionTodo = (row: ProductionTodoRow): ProductionTodo => ({
  id: row.id,
  productionId: row.production_id,
  stepId: row.step_id,
  label: row.label,
  defaultMinutes: row.default_minutes,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Les tâches d'étape, leurs variantes ponctuelles, et l'état coché des deux.
 *
 * Un seul dépôt pour les trois tables : elles ne se lisent jamais séparément — l'écran
 * qui affiche les tâches d'une vidéo a besoin du référentiel, du ponctuel et des coches
 * dans la même réponse, et les séparer imposerait trois allers-retours pour dessiner
 * une case.
 */
export class SqliteTodoRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  // --- Référentiel : les tâches habituelles d'une étape ---------------------

  findStepTodos(includeArchived = false): StepTodo[] {
    const clause = includeArchived ? '' : 'WHERE is_archived = 0';
    const rows = this.db
      .prepare(`SELECT * FROM step_todos ${clause} ORDER BY sort_order, created_at`)
      .all() as unknown as StepTodoRow[];
    return rows.map(toStepTodo);
  }

  findStepTodoById(id: string): StepTodo | null {
    const row = this.db.prepare('SELECT * FROM step_todos WHERE id = ?').get(id) as
      StepTodoRow | undefined;
    return row ? toStepTodo(row) : null;
  }

  createStepTodo(input: CreateStepTodoInput): StepTodo {
    const id = newId();
    const now = new Date().toISOString();
    const nextOrder =
      input.sortOrder ??
      (
        this.db
          .prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM step_todos WHERE step_id = ?')
          .get(input.stepId) as { n: number }
      ).n + 1;

    this.db
      .prepare(
        `INSERT INTO step_todos
           (id, step_id, label, default_minutes, sort_order, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(id, input.stepId, input.label, input.defaultMinutes ?? null, nextOrder, now, now);

    return this.findStepTodoById(id)!;
  }

  updateStepTodo(id: string, input: UpdateStepTodoInput): StepTodo {
    const existing = this.findStepTodoById(id);
    if (!existing) throw notFound('Tâche');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.label !== undefined) set('label', input.label);
    if (input.defaultMinutes !== undefined) set('default_minutes', input.defaultMinutes);
    if (input.sortOrder !== undefined) set('sort_order', input.sortOrder);
    if (input.isArchived !== undefined) set('is_archived', input.isArchived ? 1 : 0);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE step_todos SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findStepTodoById(id)!;
  }

  /**
   * Supprime la tâche du référentiel **et** les coches de toutes les vidéos.
   * `production_todo_checks.todo_id` désigne l'une ou l'autre des deux tables : aucune
   * clé étrangère ne peut faire ce ménage à notre place.
   */
  deleteStepTodo(id: string): void {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM production_todo_checks WHERE todo_id = ?').run(id);
      const result = this.db.prepare('DELETE FROM step_todos WHERE id = ?').run(id);
      if (result.changes === 0) throw notFound('Tâche');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // --- Tâches ponctuelles d'une vidéo ---------------------------------------

  findProductionTodos(productionIds: string[]): ProductionTodo[] {
    if (productionIds.length === 0) return [];
    const rows = this.db
      .prepare(
        `SELECT * FROM production_todos
          WHERE production_id IN (${placeholders(productionIds.length)})
          ORDER BY sort_order, created_at`,
      )
      .all(...(productionIds as never[])) as unknown as ProductionTodoRow[];
    return rows.map(toProductionTodo);
  }

  findProductionTodoById(id: string): ProductionTodo | null {
    const row = this.db.prepare('SELECT * FROM production_todos WHERE id = ?').get(id) as
      ProductionTodoRow | undefined;
    return row ? toProductionTodo(row) : null;
  }

  createProductionTodo(input: CreateProductionTodoInput): ProductionTodo {
    const id = newId();
    const now = new Date().toISOString();
    const nextOrder =
      (
        this.db
          .prepare(
            'SELECT COALESCE(MAX(sort_order), 0) AS n FROM production_todos WHERE production_id = ?',
          )
          .get(input.productionId) as { n: number }
      ).n + 1;

    this.db
      .prepare(
        `INSERT INTO production_todos
           (id, production_id, step_id, label, default_minutes, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.productionId,
        input.stepId ?? null,
        input.label,
        input.defaultMinutes ?? null,
        nextOrder,
        now,
        now,
      );

    return this.findProductionTodoById(id)!;
  }

  updateProductionTodo(id: string, input: UpdateProductionTodoInput): ProductionTodo {
    const existing = this.findProductionTodoById(id);
    if (!existing) throw notFound('Tâche');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.label !== undefined) set('label', input.label);
    if (input.stepId !== undefined) set('step_id', input.stepId);
    if (input.defaultMinutes !== undefined) set('default_minutes', input.defaultMinutes);
    if (input.sortOrder !== undefined) set('sort_order', input.sortOrder);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE production_todos SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findProductionTodoById(id)!;
  }

  deleteProductionTodo(id: string): void {
    this.db.exec('BEGIN');
    try {
      this.db.prepare('DELETE FROM production_todo_checks WHERE todo_id = ?').run(id);
      const result = this.db.prepare('DELETE FROM production_todos WHERE id = ?').run(id);
      if (result.changes === 0) throw notFound('Tâche');
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  // --- Coches ---------------------------------------------------------------

  /** Coches d'un lot de vidéos : `production_id` puis `todo_id` vers sa date. */
  findChecks(productionIds: string[]): Map<string, Map<string, string>> {
    const byProduction = new Map<string, Map<string, string>>();
    if (productionIds.length === 0) return byProduction;

    const rows = this.db
      .prepare(
        `SELECT production_id, todo_id, checked_at
           FROM production_todo_checks
          WHERE production_id IN (${placeholders(productionIds.length)})`,
      )
      .all(...(productionIds as never[])) as unknown as Array<{
      production_id: string;
      todo_id: string;
      checked_at: string;
    }>;

    for (const row of rows) {
      const map = byProduction.get(row.production_id) ?? new Map<string, string>();
      map.set(row.todo_id, row.checked_at);
      byProduction.set(row.production_id, map);
    }
    return byProduction;
  }

  check(productionId: string, todoId: string): void {
    // Recocher ne repousse pas la date : même règle que les étapes.
    this.db
      .prepare(
        `INSERT INTO production_todo_checks (production_id, todo_id, checked_at)
         VALUES (?, ?, ?)
         ON CONFLICT(production_id, todo_id) DO NOTHING`,
      )
      .run(productionId, todoId, new Date().toISOString());
  }

  uncheck(productionId: string, todoId: string): void {
    this.db
      .prepare('DELETE FROM production_todo_checks WHERE production_id = ? AND todo_id = ?')
      .run(productionId, todoId);
  }

  /**
   * Les tâches d'une vidéo, référentiel et ponctuelles réunies, à plat.
   *
   * C'est cette liste qui donne l'avancement des pastilles et le pourcentage global :
   * une seule source, donc pas deux comptages qui finissent par se contredire.
   */
  listForProduction(productionId: string): TodoItem[] {
    const checks = this.findChecks([productionId]).get(productionId) ?? new Map<string, string>();

    const fromReferential: TodoItem[] = this.findStepTodos().map((todo) => ({
      id: todo.id,
      stepId: todo.stepId,
      label: todo.label,
      defaultMinutes: todo.defaultMinutes,
      origin: 'step' as const,
      checked: checks.has(todo.id),
      checkedAt: checks.get(todo.id) ?? null,
      sortOrder: todo.sortOrder,
    }));

    const punctual: TodoItem[] = this.findProductionTodos([productionId]).map((todo) => ({
      id: todo.id,
      stepId: todo.stepId,
      label: todo.label,
      defaultMinutes: todo.defaultMinutes,
      origin: 'production' as const,
      checked: checks.has(todo.id),
      checkedAt: checks.get(todo.id) ?? null,
      // Les ponctuelles ferment la liste de leur étape : les habituelles d'abord,
      // parce que ce sont celles qu'on parcourt de mémoire.
      sortOrder: 1000 + todo.sortOrder,
    }));

    return [...fromReferential, ...punctual].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /** Les tâches de tout un lot de vidéos, pour les cartes de la file d'attente. */
  listForProductions(productionIds: string[]): Map<string, TodoItem[]> {
    const result = new Map<string, TodoItem[]>();
    if (productionIds.length === 0) return result;

    const referential = this.findStepTodos();
    const punctualByProduction = new Map<string, ProductionTodo[]>();
    for (const todo of this.findProductionTodos(productionIds)) {
      const list = punctualByProduction.get(todo.productionId) ?? [];
      list.push(todo);
      punctualByProduction.set(todo.productionId, list);
    }
    const checks = this.findChecks(productionIds);

    for (const productionId of productionIds) {
      const done = checks.get(productionId) ?? new Map<string, string>();
      const items: TodoItem[] = referential.map((todo) => ({
        id: todo.id,
        stepId: todo.stepId,
        label: todo.label,
        defaultMinutes: todo.defaultMinutes,
        origin: 'step' as const,
        checked: done.has(todo.id),
        checkedAt: done.get(todo.id) ?? null,
        sortOrder: todo.sortOrder,
      }));

      for (const todo of punctualByProduction.get(productionId) ?? []) {
        items.push({
          id: todo.id,
          stepId: todo.stepId,
          label: todo.label,
          defaultMinutes: todo.defaultMinutes,
          origin: 'production',
          checked: done.has(todo.id),
          checkedAt: done.get(todo.id) ?? null,
          sortOrder: 1000 + todo.sortOrder,
        });
      }

      result.set(
        productionId,
        items.sort((a, b) => a.sortOrder - b.sortOrder),
      );
    }

    return result;
  }
}
