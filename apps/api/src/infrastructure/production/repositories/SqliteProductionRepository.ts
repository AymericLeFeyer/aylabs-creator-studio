import type { DatabaseSync } from 'node:sqlite';
import { today } from '../../../shared/dates.ts';
import type {
  CreateProductionInput,
  Production,
  ProductionProductRef,
  ProductionSponsorshipRef,
  ProductionStatus,
  ProductionStepCheck,
  ProductionView,
  UpdateProductionInput,
} from '../../../domain/production/entities/Production.ts';
import type { TodoItem } from '../../../domain/production/entities/StepTodo.ts';
import type {
  ProductionFilter,
  ProductionRepository,
} from '../../../domain/production/repositories/ProductionRepository.ts';
import { SqliteTodoRepository } from './SqliteTodoRepository.ts';
import { placeholders } from '../../db/filters.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface ProductionRow {
  id: string;
  channel_id: string | null;
  video_id: string | null;
  title: string;
  status: string;
  paused_reason: string | null;
  paused_at: string | null;
  start_date: string | null;
  planned_date: string | null;
  script: string;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface ProductionViewRow extends ProductionRow {
  channel_name: string | null;
  channel_color: string | null;
  video_title: string | null;
  video_external_id: string | null;
  video_thumbnail_url: string | null;
  slots_count: number;
  next_slot_date: string | null;
}

const toDomain = (row: ProductionRow): Production => ({
  id: row.id,
  channelId: row.channel_id,
  videoId: row.video_id,
  title: row.title,
  status: row.status as ProductionStatus,
  pausedReason: row.paused_reason,
  pausedAt: row.paused_at,
  startDate: row.start_date,
  plannedDate: row.planned_date,
  script: row.script,
  notes: row.notes,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Les colonnes propres à la production.
 *
 * Les produits et les sponsos ne sont **pas** joints ici : les joindre sur la même ligne
 * produirait un produit cartésien, et trois produits face à deux sponsos donneraient six
 * lignes à dédupliquer en mémoire. Ils sont chargés à part, en une requête pour tout le
 * lot (`loadPartners`), comme les étapes cochées.
 */
const VIEW_COLUMNS = `
  p.*,
  ch.name  AS channel_name,
  ch.color AS channel_color,
  v.title  AS video_title,
  v.external_id   AS video_external_id,
  v.thumbnail_url AS video_thumbnail_url,
  (SELECT COUNT(*) FROM production_slots s WHERE s.production_id = p.id) AS slots_count,
  (SELECT MIN(s.date) FROM production_slots s
    WHERE s.production_id = p.id AND s.done = 0 AND s.date >= ?) AS next_slot_date
`;

const VIEW_JOINS = `
  FROM productions p
  LEFT JOIN channels ch ON ch.id = p.channel_id
  LEFT JOIN videos   v  ON v.id  = p.video_id
`;

export class SqliteProductionRepository implements ProductionRepository {
  private readonly db: DatabaseSync;
  /**
   * Les tâches font partie de la vue d'une production : la pastille « Montage 2/5 » se
   * lit sur chaque carte de la file. Les charger ici évite une requête par pastille.
   */
  private readonly todos: SqliteTodoRepository;

  constructor(db: DatabaseSync) {
    this.db = db;
    this.todos = new SqliteTodoRepository(db);
  }

  /** Temps enregistré par production, en minutes closes, pour tout le lot d'un coup. */
  private loadTracked(productionIds: string[]): Map<string, number> {
    const totals = new Map<string, number>();
    if (productionIds.length === 0) return totals;

    const rows = this.db
      .prepare(
        `SELECT production_id, COALESCE(SUM(minutes), 0) AS total
           FROM production_time_entries
          WHERE production_id IN (${placeholders(productionIds.length)})
          GROUP BY production_id`,
      )
      .all(...(productionIds as never[])) as unknown as Array<{
      production_id: string;
      total: number;
    }>;

    for (const row of rows) totals.set(row.production_id, row.total);
    return totals;
  }

  private buildWhere(filter: ProductionFilter): { clause: string; params: unknown[] } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const statuses = filter.statuses ?? [];
    if (statuses.length > 0) {
      conditions.push(`p.status IN (${placeholders(statuses.length)})`);
      params.push(...statuses);
    }

    const channelIds = filter.channelIds ?? [];
    if (channelIds.length > 0) {
      // Une production sans chaîne décidée reste visible : c'est un état normal,
      // pas une donnée orpheline à masquer dès qu'on filtre.
      conditions.push(
        `(p.channel_id IN (${placeholders(channelIds.length)}) OR p.channel_id IS NULL)`,
      );
      params.push(...channelIds);
    }

    if (filter.range) {
      conditions.push('p.planned_date BETWEEN ? AND ?');
      params.push(filter.range.from, filter.range.to);
    }

    if (filter.search) {
      conditions.push('p.title LIKE ?');
      params.push(`%${filter.search}%`);
    }

    return {
      clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
      params,
    };
  }

  /** Charge les cases cochées des productions données, en une requête pour tout le lot. */
  private loadChecks(productionIds: string[]): Map<string, ProductionStepCheck[]> {
    const byProduction = new Map<string, ProductionStepCheck[]>();
    if (productionIds.length === 0) return byProduction;

    const rows = this.db
      .prepare(
        `SELECT production_id, step_id, checked_at
           FROM production_step_checks
          WHERE production_id IN (${placeholders(productionIds.length)})`,
      )
      .all(...(productionIds as never[])) as unknown as Array<{
      production_id: string;
      step_id: string;
      checked_at: string;
    }>;

    for (const row of rows) {
      const list = byProduction.get(row.production_id) ?? [];
      list.push({ stepId: row.step_id, checkedAt: row.checked_at });
      byProduction.set(row.production_id, list);
    }
    return byProduction;
  }

  /**
   * Charge les produits et les sponsos des productions données, en deux requêtes pour
   * tout le lot. Deux lectures et non une jointure, pour la même raison que ci-dessus.
   */
  private loadPartners(productionIds: string[]): {
    products: Map<string, ProductionProductRef[]>;
    sponsorships: Map<string, ProductionSponsorshipRef[]>;
  } {
    const products = new Map<string, ProductionProductRef[]>();
    const sponsorships = new Map<string, ProductionSponsorshipRef[]>();
    if (productionIds.length === 0) return { products, sponsorships };

    const holes = placeholders(productionIds.length);

    const productRows = this.db
      .prepare(
        `SELECT production_id, id, name, status, value_cents
           FROM products
          WHERE production_id IN (${holes})
          ORDER BY name COLLATE NOCASE`,
      )
      .all(...(productionIds as never[])) as unknown as Array<{
      production_id: string;
      id: string;
      name: string;
      status: string;
      value_cents: number;
    }>;

    for (const row of productRows) {
      const list = products.get(row.production_id) ?? [];
      list.push({
        id: row.id,
        name: row.name,
        status: row.status as ProductionProductRef['status'],
        valueCents: row.value_cents,
      });
      products.set(row.production_id, list);
    }

    const sponsorshipRows = this.db
      .prepare(
        `SELECT production_id, id, label, status, amount_cents
           FROM sponsorships
          WHERE production_id IN (${holes})
          ORDER BY label COLLATE NOCASE`,
      )
      .all(...(productionIds as never[])) as unknown as Array<{
      production_id: string;
      id: string;
      label: string;
      status: string;
      amount_cents: number;
    }>;

    for (const row of sponsorshipRows) {
      const list = sponsorships.get(row.production_id) ?? [];
      list.push({
        id: row.id,
        label: row.label,
        status: row.status as ProductionSponsorshipRef['status'],
        amountCents: row.amount_cents,
      });
      sponsorships.set(row.production_id, list);
    }

    return { products, sponsorships };
  }

  private toView(
    row: ProductionViewRow,
    checks: ProductionStepCheck[],
    products: ProductionProductRef[],
    sponsorships: ProductionSponsorshipRef[],
    todos: TodoItem[],
    trackedMinutes: number,
  ): ProductionView {
    return {
      ...toDomain(row),
      channelName: row.channel_name,
      channelColor: row.channel_color,
      videoTitle: row.video_title,
      videoExternalId: row.video_external_id,
      videoThumbnailUrl: row.video_thumbnail_url,
      steps: checks,
      nextSlotDate: row.next_slot_date,
      slotsCount: row.slots_count,
      products,
      sponsorships,
      todos,
      trackedMinutes,
    };
  }

  findAll(filter: ProductionFilter = {}): ProductionView[] {
    const { clause, params } = this.buildWhere(filter);

    // `today()` alimente la sous-requête « prochain créneau » : elle est dans le SELECT,
    // donc son paramètre passe AVANT ceux du WHERE.
    const rows = this.db
      .prepare(`SELECT ${VIEW_COLUMNS} ${VIEW_JOINS} ${clause} ORDER BY p.sort_order, p.created_at`)
      .all(today(), ...(params as never[])) as unknown as ProductionViewRow[];

    const ids = rows.map((row) => row.id);
    const checks = this.loadChecks(ids);
    const partners = this.loadPartners(ids);
    const todos = this.todos.listForProductions(ids);
    const tracked = this.loadTracked(ids);

    return rows.map((row) =>
      this.toView(
        row,
        checks.get(row.id) ?? [],
        partners.products.get(row.id) ?? [],
        partners.sponsorships.get(row.id) ?? [],
        todos.get(row.id) ?? [],
        tracked.get(row.id) ?? 0,
      ),
    );
  }

  findById(id: string): Production | null {
    const row = this.db.prepare('SELECT * FROM productions WHERE id = ?').get(id) as
      ProductionRow | undefined;
    return row ? toDomain(row) : null;
  }

  findViewById(id: string): ProductionView | null {
    const row = this.db
      .prepare(`SELECT ${VIEW_COLUMNS} ${VIEW_JOINS} WHERE p.id = ?`)
      .get(today(), id) as ProductionViewRow | undefined;
    if (!row) return null;
    const partners = this.loadPartners([id]);
    return this.toView(
      row,
      this.loadChecks([id]).get(id) ?? [],
      partners.products.get(id) ?? [],
      partners.sponsorships.get(id) ?? [],
      this.todos.listForProduction(id),
      this.loadTracked([id]).get(id) ?? 0,
    );
  }

  create(input: CreateProductionInput): Production {
    const id = newId();
    const now = new Date().toISOString();
    // Nouvelle entrée en fin de file : c'est à toi de la remonter, l'outil ne
    // décide d'aucune priorité.
    const nextOrder =
      (
        this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM productions').get() as {
          n: number;
        }
      ).n + 1;
    const status = input.status ?? 'idea';

    this.db
      .prepare(
        `INSERT INTO productions
           (id, channel_id, video_id, title, status, paused_reason, paused_at,
            start_date, planned_date, script, notes, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.channelId ?? null,
        input.videoId ?? null,
        input.title,
        status,
        input.pausedReason ?? null,
        status === 'paused' ? now : null,
        input.startDate ?? null,
        input.plannedDate ?? null,
        input.script ?? '',
        input.notes ?? null,
        nextOrder,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateProductionInput): Production {
    const existing = this.findById(id);
    if (!existing) throw notFound('Production');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.title !== undefined) set('title', input.title);
    if (input.channelId !== undefined) set('channel_id', input.channelId);
    if (input.videoId !== undefined) set('video_id', input.videoId);
    if (input.pausedReason !== undefined) set('paused_reason', input.pausedReason);
    if (input.startDate !== undefined) set('start_date', input.startDate);
    if (input.plannedDate !== undefined) set('planned_date', input.plannedDate);
    if (input.script !== undefined) set('script', input.script);
    if (input.notes !== undefined) set('notes', input.notes);
    if (input.sortOrder !== undefined) set('sort_order', input.sortOrder);

    // `pausedAt` est posé par le passage EN pause, pas par la mise à jour de la raison :
    // corriger le libellé d'un blocage ne doit pas remettre le compteur à zéro.
    if (input.status !== undefined) {
      set('status', input.status);
      if (input.status === 'paused' && existing.status !== 'paused') {
        set('paused_at', new Date().toISOString());
      } else if (input.status !== 'paused') {
        set('paused_at', null);
      }
    }

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE productions SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM productions WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Production');
  }

  /**
   * Réécrit l'ordre de la file en une transaction : un classement à moitié appliqué
   * afficherait deux fois le même rang et une file dans un ordre imprévisible.
   */
  reorder(ids: string[]): void {
    if (ids.length === 0) return;
    const stmt = this.db.prepare('UPDATE productions SET sort_order = ? WHERE id = ?');

    this.db.exec('BEGIN');
    try {
      ids.forEach((id, index) => stmt.run(index + 1, id));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  checkStep(productionId: string, stepId: string): void {
    // `DO NOTHING` : recocher une case déjà cochée ne doit pas repousser sa date.
    this.db
      .prepare(
        `INSERT INTO production_step_checks (production_id, step_id, checked_at)
         VALUES (?, ?, ?)
         ON CONFLICT(production_id, step_id) DO NOTHING`,
      )
      .run(productionId, stepId, new Date().toISOString());
  }

  uncheckStep(productionId: string, stepId: string): void {
    this.db
      .prepare('DELETE FROM production_step_checks WHERE production_id = ? AND step_id = ?')
      .run(productionId, stepId);
  }
}
