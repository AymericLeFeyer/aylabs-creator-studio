import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateProductInput,
  Product,
  ProductStatus,
  ProductView,
  UpdateProductInput,
} from '../../../domain/product/entities/Product.ts';
import type {
  ProductFilter,
  ProductRepository,
} from '../../../domain/product/repositories/ProductRepository.ts';
import { placeholders } from '../../db/filters.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface ProductRow {
  id: string;
  brand_id: string | null;
  production_id: string | null;
  channel_id: string | null;
  revenue_entry_id: string | null;
  name: string;
  url: string | null;
  value_cents: number;
  status: string;
  requested_at: string | null;
  deadline: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface ProductViewRow extends ProductRow {
  brand_name: string | null;
  brand_color: string | null;
  production_title: string | null;
  channel_name: string | null;
}

const toDomain = (row: ProductRow): Product => ({
  id: row.id,
  brandId: row.brand_id,
  productionId: row.production_id,
  channelId: row.channel_id,
  revenueEntryId: row.revenue_entry_id,
  name: row.name,
  url: row.url,
  valueCents: row.value_cents,
  status: row.status as ProductStatus,
  requestedAt: row.requested_at,
  deadline: row.deadline,
  receivedAt: row.received_at,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqliteProductRepository implements ProductRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(filter: ProductFilter = {}): ProductView[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const inFilter = (column: string, values: string[] | undefined) => {
      if (!values || values.length === 0) return;
      conditions.push(`p.${column} IN (${placeholders(values.length)})`);
      params.push(...values);
    };

    inFilter('status', filter.statuses);
    inFilter('brand_id', filter.brandIds);
    inFilter('production_id', filter.productionIds);
    inFilter('channel_id', filter.channelIds);

    if (filter.receivedRange) {
      conditions.push('p.received_at BETWEEN ? AND ?');
      params.push(filter.receivedRange.from, filter.receivedRange.to);
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.db
      .prepare(
        `SELECT p.*,
                b.name   AS brand_name,
                b.color  AS brand_color,
                pr.title AS production_title,
                ch.name  AS channel_name
           FROM products p
           LEFT JOIN brands b       ON b.id  = p.brand_id
           LEFT JOIN productions pr ON pr.id = p.production_id
           LEFT JOIN channels ch    ON ch.id = p.channel_id
           ${clause}
          ORDER BY p.deadline IS NULL, p.deadline, p.created_at DESC`,
      )
      .all(...(params as never[])) as unknown as ProductViewRow[];

    return rows.map((row) => ({
      ...toDomain(row),
      brandName: row.brand_name,
      brandColor: row.brand_color,
      productionTitle: row.production_title,
      channelName: row.channel_name,
    }));
  }

  findById(id: string): Product | null {
    const row = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as
      ProductRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateProductInput): Product {
    const id = newId();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO products
           (id, brand_id, production_id, channel_id, revenue_entry_id, name, url,
            value_cents, status, requested_at, deadline, received_at, notes,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.brandId ?? null,
        input.productionId ?? null,
        input.channelId ?? null,
        input.name,
        input.url ?? null,
        input.valueCents ?? 0,
        input.status ?? 'discussion',
        input.requestedAt ?? null,
        input.deadline ?? null,
        input.receivedAt ?? null,
        input.notes ?? null,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateProductInput): Product {
    const existing = this.findById(id);
    if (!existing) throw notFound('Produit');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.brandId !== undefined) set('brand_id', input.brandId);
    if (input.productionId !== undefined) set('production_id', input.productionId);
    if (input.channelId !== undefined) set('channel_id', input.channelId);
    if (input.name !== undefined) set('name', input.name);
    if (input.url !== undefined) set('url', input.url);
    if (input.valueCents !== undefined) set('value_cents', input.valueCents);
    if (input.status !== undefined) set('status', input.status);
    if (input.requestedAt !== undefined) set('requested_at', input.requestedAt);
    if (input.deadline !== undefined) set('deadline', input.deadline);
    if (input.receivedAt !== undefined) set('received_at', input.receivedAt);
    if (input.notes !== undefined) set('notes', input.notes);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM products WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Produit');
  }

  /** Écriture technique du lien vers le revenu, réservée au use case de synchronisation. */
  setRevenueEntryId(id: string, revenueEntryId: string | null): void {
    this.db
      .prepare('UPDATE products SET revenue_entry_id = ?, updated_at = ? WHERE id = ?')
      .run(revenueEntryId, new Date().toISOString(), id);
  }

  countByProduction(): Array<{ productionId: string; total: number; pending: number }> {
    const rows = this.db
      .prepare(
        `SELECT production_id,
                COUNT(*) AS total,
                SUM(CASE WHEN status IN ('discussion','confirmed','shipped') THEN 1 ELSE 0 END) AS pending
           FROM products
          WHERE production_id IS NOT NULL
          GROUP BY production_id`,
      )
      .all() as unknown as Array<{ production_id: string; total: number; pending: number }>;

    return rows.map((row) => ({
      productionId: row.production_id,
      total: row.total,
      pending: row.pending,
    }));
  }
}
