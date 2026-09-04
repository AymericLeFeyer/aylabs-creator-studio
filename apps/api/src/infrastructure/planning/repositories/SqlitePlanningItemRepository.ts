import type { DatabaseSync } from 'node:sqlite';
import type {
  CreatePlanningItemInput,
  PlanningItem,
  PlanningItemView,
} from '../../../domain/planning/entities/PlanningItem.ts';
import type {
  PlanningItemFilter,
  PlanningItemRepository,
} from '../../../domain/planning/repositories/PlanningRepository.ts';
import { placeholders } from '../../db/filters.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface Row {
  id: string;
  production_id: string;
  step_id: string | null;
  todo_id: string | null;
  label: string;
  planned_minutes: number;
  sequence: number;
  status: PlanningItem['status'];
  created_at: string;
  updated_at: string;
}

interface ViewRow extends Row {
  production_title: string;
  channel_id: string | null;
  channel_color: string | null;
  step_name: string | null;
  step_color: string | null;
  planned_date: string | null;
  scheduled_minutes: number | null;
  approved_minutes: number | null;
}

const toDomain = (row: Row): PlanningItem => ({
  id: row.id,
  productionId: row.production_id,
  stepId: row.step_id,
  todoId: row.todo_id,
  label: row.label,
  plannedMinutes: row.planned_minutes,
  sequence: row.sequence,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Durée d'un créneau en minutes, calculée en SQL.
 *
 * Un créneau sans horaire complet vaut 0, exactement comme `slotMinutes` côté domaine :
 * la règle est la même des deux côtés, et un créneau « samedi » sans heure ne doit pas
 * inventer une durée qui fausserait le reste à planifier.
 */
const SLOT_MINUTES = `
  CASE WHEN s.start_time IS NULL OR s.end_time IS NULL THEN 0
       ELSE MAX(0,
         (CAST(substr(s.end_time, 1, 2) AS INTEGER) * 60
        + CAST(substr(s.end_time, 4, 2) AS INTEGER))
       - (CAST(substr(s.start_time, 1, 2) AS INTEGER) * 60
        + CAST(substr(s.start_time, 4, 2) AS INTEGER)))
  END`;

/**
 * La pile de travail : ce qui est « en cours » et attend des créneaux.
 *
 * `scheduledMinutes` et `approvedMinutes` sont calculés par sous-requête plutôt que
 * chargés à part : le planning affiche « 45 min posées sur 90 » sur chaque ligne, et un
 * aller-retour par ligne ferait autant de requêtes que de tâches en cours.
 */
export class SqlitePlanningItemRepository implements PlanningItemRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(filter: PlanningItemFilter = {}): PlanningItemView[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const productionIds = filter.productionIds ?? [];
    if (productionIds.length > 0) {
      conditions.push(`i.production_id IN (${placeholders(productionIds.length)})`);
      params.push(...productionIds);
    }
    const statuses = filter.statuses ?? [];
    if (statuses.length > 0) {
      conditions.push(`i.status IN (${placeholders(statuses.length)})`);
      params.push(...statuses);
    }
    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.db
      .prepare(
        `SELECT i.*,
                p.title        AS production_title,
                p.channel_id   AS channel_id,
                p.planned_date AS planned_date,
                ch.color       AS channel_color,
                st.name        AS step_name,
                st.color       AS step_color,
                (SELECT COALESCE(SUM(${SLOT_MINUTES}), 0) FROM production_slots s
                  WHERE s.item_id = i.id AND s.done = 0) AS scheduled_minutes,
                (SELECT COALESCE(SUM(${SLOT_MINUTES}), 0) FROM production_slots s
                  WHERE s.item_id = i.id AND s.done = 1) AS approved_minutes
           FROM planning_items i
           JOIN productions p ON p.id = i.production_id
           LEFT JOIN channels ch ON ch.id = p.channel_id
           LEFT JOIN production_steps st ON st.id = i.step_id
           ${clause}
          ORDER BY i.sequence, i.created_at`,
      )
      .all(...(params as never[])) as unknown as ViewRow[];

    return rows.map((row) => ({
      ...toDomain(row),
      productionTitle: row.production_title,
      channelId: row.channel_id,
      channelColor: row.channel_color,
      stepName: row.step_name,
      stepColor: row.step_color,
      plannedDate: row.planned_date,
      scheduledMinutes: row.scheduled_minutes ?? 0,
      approvedMinutes: row.approved_minutes ?? 0,
    }));
  }

  findById(id: string): PlanningItem | null {
    const row = this.db.prepare('SELECT * FROM planning_items WHERE id = ?').get(id) as
      Row | undefined;
    return row ? toDomain(row) : null;
  }

  nextSequence(): number {
    const row = this.db
      .prepare('SELECT COALESCE(MAX(sequence), 0) AS n FROM planning_items')
      .get() as { n: number };
    return row.n + 1;
  }

  /**
   * Remettre une tâche déjà présente **la rouvre** au lieu d'échouer.
   *
   * C'est le geste normal : on rajoute « Écriture » sur une vidéo dont une sous-étape
   * avait été cochée par erreur. Un conflit obligerait à comprendre laquelle des cinq
   * cases pose problème avant de pouvoir replanifier quoi que ce soit.
   */
  create(input: CreatePlanningItemInput): PlanningItem {
    const existing = this.db
      .prepare(
        `SELECT * FROM planning_items
          WHERE production_id = ?
            AND COALESCE(step_id, '') = COALESCE(?, '')
            AND COALESCE(todo_id, '') = COALESCE(?, '')`,
      )
      .get(input.productionId, input.stepId, input.todoId) as Row | undefined;

    if (existing) {
      return this.update(existing.id, {
        status: 'pending',
        plannedMinutes: input.plannedMinutes,
        label: input.label,
        ...(input.sequence !== undefined ? { sequence: input.sequence } : {}),
      });
    }

    const id = newId();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO planning_items
           (id, production_id, step_id, todo_id, label, planned_minutes, sequence, status,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
      )
      .run(
        id,
        input.productionId,
        input.stepId,
        input.todoId,
        input.label,
        input.plannedMinutes,
        input.sequence ?? this.nextSequence(),
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(
    id: string,
    input: Partial<Pick<PlanningItem, 'label' | 'plannedMinutes' | 'sequence' | 'status'>>,
  ): PlanningItem {
    const existing = this.findById(id);
    if (!existing) throw notFound('Ligne de planning');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.label !== undefined) set('label', input.label);
    if (input.plannedMinutes !== undefined) set('planned_minutes', input.plannedMinutes);
    if (input.sequence !== undefined) set('sequence', input.sequence);
    if (input.status !== undefined) set('status', input.status);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE planning_items SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  /**
   * Supprime la ligne. Les créneaux qui la visaient sont **détachés, pas supprimés**
   * (`ON DELETE SET NULL`) : retirer une tâche de la pile ne doit pas effacer le temps
   * déjà passé dessus.
   */
  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM planning_items WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Ligne de planning');
  }

  private setStatus(where: string, params: unknown[], status: PlanningItem['status']): void {
    this.db
      .prepare(`UPDATE planning_items SET status = ?, updated_at = ? WHERE ${where}`)
      .run(status, new Date().toISOString(), ...(params as never[]));
  }

  closeForTodo(productionId: string, todoId: string): void {
    this.setStatus('production_id = ? AND todo_id = ?', [productionId, todoId], 'done');
  }

  closeForStep(productionId: string, stepId: string): void {
    this.setStatus(
      'production_id = ? AND step_id = ? AND todo_id IS NULL',
      [productionId, stepId],
      'done',
    );
  }

  reopenForTodo(productionId: string, todoId: string): void {
    this.setStatus(
      "production_id = ? AND todo_id = ? AND status = 'done'",
      [productionId, todoId],
      'pending',
    );
  }

  reopenForStep(productionId: string, stepId: string): void {
    this.setStatus(
      "production_id = ? AND step_id = ? AND todo_id IS NULL AND status = 'done'",
      [productionId, stepId],
      'pending',
    );
  }
}
