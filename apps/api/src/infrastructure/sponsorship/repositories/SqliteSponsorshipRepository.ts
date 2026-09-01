import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateSponsorshipInput,
  Sponsorship,
  SponsorshipStatus,
  SponsorshipView,
  UpdateSponsorshipInput,
} from '../../../domain/sponsorship/entities/Sponsorship.ts';
import type {
  SponsorshipFilter,
  SponsorshipRepository,
} from '../../../domain/sponsorship/repositories/SponsorshipRepository.ts';
import { placeholders } from '../../db/filters.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface SponsorshipRow {
  id: string;
  brand_id: string | null;
  production_id: string | null;
  video_id: string | null;
  channel_id: string | null;
  revenue_entry_id: string | null;
  label: string;
  amount_cents: number;
  status: string;
  deadline: string | null;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface SponsorshipViewRow extends SponsorshipRow {
  brand_name: string | null;
  brand_color: string | null;
  production_title: string | null;
  video_title: string | null;
  channel_name: string | null;
  products_count: number;
  products_value_cents: number;
}

const toDomain = (row: SponsorshipRow): Sponsorship => ({
  id: row.id,
  brandId: row.brand_id,
  productionId: row.production_id,
  videoId: row.video_id,
  channelId: row.channel_id,
  revenueEntryId: row.revenue_entry_id,
  label: row.label,
  amountCents: row.amount_cents,
  status: row.status as SponsorshipStatus,
  deadline: row.deadline,
  paidAt: row.paid_at,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqliteSponsorshipRepository implements SponsorshipRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(filter: SponsorshipFilter = {}): SponsorshipView[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    const inFilter = (column: string, values: string[] | undefined) => {
      if (!values || values.length === 0) return;
      conditions.push(`s.${column} IN (${placeholders(values.length)})`);
      params.push(...values);
    };

    inFilter('status', filter.statuses);
    inFilter('brand_id', filter.brandIds);
    inFilter('production_id', filter.productionIds);
    inFilter('channel_id', filter.channelIds);

    if (filter.paidRange) {
      conditions.push('s.paid_at BETWEEN ? AND ?');
      params.push(filter.paidRange.from, filter.paidRange.to);
    }

    const clause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = this.db
      .prepare(
        `SELECT s.*,
                b.name   AS brand_name,
                b.color  AS brand_color,
                pr.title AS production_title,
                v.title  AS video_title,
                ch.name  AS channel_name,
                -- Sous-requetes correlees : joindre les produits multiplierait la ligne
                -- de la sponso par le nombre de colis recus.
                (SELECT COUNT(*) FROM products p WHERE p.sponsorship_id = s.id)
                  AS products_count,
                (SELECT COALESCE(SUM(p.value_cents), 0) FROM products p
                  WHERE p.sponsorship_id = s.id AND p.status = 'received')
                  AS products_value_cents
           FROM sponsorships s
           LEFT JOIN brands b       ON b.id  = s.brand_id
           LEFT JOIN productions pr ON pr.id = s.production_id
           LEFT JOIN videos v       ON v.id  = s.video_id
           LEFT JOIN channels ch    ON ch.id = s.channel_id
           ${clause}
          -- L'echeance la plus courte d'abord : contrairement aux produits, ce qui
          -- compte sur une sponso est ce qu'on doit encore livrer. Sans echeance, la
          -- sponso n'a pas d'urgence connue et ferme la liste.
          ORDER BY s.deadline IS NULL, s.deadline ASC, s.created_at DESC`,
      )
      .all(...(params as never[])) as unknown as SponsorshipViewRow[];

    return rows.map((row) => ({
      ...toDomain(row),
      brandName: row.brand_name,
      brandColor: row.brand_color,
      productionTitle: row.production_title,
      videoTitle: row.video_title,
      channelName: row.channel_name,
      productsCount: row.products_count,
      productsValueCents: row.products_value_cents,
    }));
  }

  findById(id: string): Sponsorship | null {
    const row = this.db.prepare('SELECT * FROM sponsorships WHERE id = ?').get(id) as
      SponsorshipRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateSponsorshipInput): Sponsorship {
    const id = newId();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO sponsorships
           (id, brand_id, production_id, video_id, channel_id, revenue_entry_id, label,
            amount_cents, status, deadline, paid_at, notes, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.brandId ?? null,
        input.productionId ?? null,
        input.videoId ?? null,
        input.channelId ?? null,
        input.label,
        input.amountCents ?? 0,
        input.status ?? 'discussion',
        input.deadline ?? null,
        input.paidAt ?? null,
        input.notes ?? null,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateSponsorshipInput): Sponsorship {
    const existing = this.findById(id);
    if (!existing) throw notFound('Sponso');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.brandId !== undefined) set('brand_id', input.brandId);
    if (input.productionId !== undefined) set('production_id', input.productionId);
    if (input.videoId !== undefined) set('video_id', input.videoId);
    if (input.channelId !== undefined) set('channel_id', input.channelId);
    if (input.label !== undefined) set('label', input.label);
    if (input.amountCents !== undefined) set('amount_cents', input.amountCents);
    if (input.status !== undefined) set('status', input.status);
    if (input.deadline !== undefined) set('deadline', input.deadline);
    if (input.paidAt !== undefined) set('paid_at', input.paidAt);
    if (input.notes !== undefined) set('notes', input.notes);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE sponsorships SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM sponsorships WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Sponso');
  }

  /** Écriture technique du lien vers le revenu, réservée au use case de synchronisation. */
  setRevenueEntryId(id: string, revenueEntryId: string | null): void {
    this.db
      .prepare('UPDATE sponsorships SET revenue_entry_id = ?, updated_at = ? WHERE id = ?')
      .run(revenueEntryId, new Date().toISOString(), id);
  }

  sumByProduction(): Array<{ productionId: string; total: number; pendingCents: number }> {
    const rows = this.db
      .prepare(
        `SELECT production_id,
                COUNT(*) AS total,
                COALESCE(SUM(CASE WHEN status IN ('discussion','todo','in_progress')
                                  THEN amount_cents ELSE 0 END), 0) AS pending_cents
           FROM sponsorships
          WHERE production_id IS NOT NULL
          GROUP BY production_id`,
      )
      .all() as unknown as Array<{
      production_id: string;
      total: number;
      pending_cents: number;
    }>;

    return rows.map((row) => ({
      productionId: row.production_id,
      total: row.total,
      pendingCents: row.pending_cents,
    }));
  }
}
