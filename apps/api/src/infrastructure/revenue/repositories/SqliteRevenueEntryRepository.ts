import type { DatabaseSync } from 'node:sqlite';
import type { IsoDate } from '../../../shared/dates.ts';
import type {
  CreateRevenueEntryInput,
  RevenueEntry,
  RevenueEntryView,
  UpdateRevenueEntryInput,
} from '../../../domain/revenue/entities/RevenueEntry.ts';
import type {
  RevenueEntryFilter,
  RevenueEntryRepository,
} from '../../../domain/revenue/repositories/RevenueRepository.ts';
import { buildEntryWhere, placeholders } from '../../db/filters.ts';
import { newId } from '../../../shared/id.ts';
import { conflict, notFound } from '../../../shared/errors.ts';

interface EntryRow {
  id: string;
  channel_id: string | null;
  category_id: string;
  video_id: string | null;
  date: string;
  amount_cents: number;
  label: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface EntryViewRow extends EntryRow {
  category_name: string;
  category_nature: string;
  category_color: string;
  channel_name: string | null;
  video_title: string | null;
}

const toDomain = (row: EntryRow): RevenueEntry => ({
  id: row.id,
  channelId: row.channel_id,
  categoryId: row.category_id,
  videoId: row.video_id,
  date: row.date,
  amountCents: row.amount_cents,
  label: row.label,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toViewDomain = (row: EntryViewRow): RevenueEntryView => ({
  ...toDomain(row),
  categoryName: row.category_name,
  categoryNature: row.category_nature as 'cash' | 'in_kind',
  categoryColor: row.category_color,
  channelName: row.channel_name,
  videoTitle: row.video_title,
});

/**
 * Refuse une saisie manuelle dans une catégorie alimentée par la collecte, et un revenu
 * dans une catégorie réservée aux dépenses.
 */
const assertAcceptsRevenue = (db: DatabaseSync, categoryId: string): void => {
  const row = db
    .prepare('SELECT is_auto, scope, name FROM categories WHERE id = ?')
    .get(categoryId) as { is_auto: number; scope: string; name: string } | undefined;
  if (!row) throw notFound('Catégorie');
  if (row.is_auto === 1) {
    throw conflict(
      'Les revenus AdSense proviennent de YouTube Analytics et ne se saisissent pas à la main.',
    );
  }
  if (row.scope === 'expense') {
    throw conflict(`« ${row.name} » est une catégorie de dépenses : elle n'accepte pas de revenu.`);
  }
};

export class SqliteRevenueEntryRepository implements RevenueEntryRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(filter: RevenueEntryFilter = {}): RevenueEntryView[] {
    const { clause, params } = buildEntryWhere(filter, 'e');
    const categoryIds = filter.categoryIds ?? [];
    const allParams = [...params];

    let sql = `
      SELECT e.*,
             c.name   AS category_name,
             c.nature AS category_nature,
             c.color  AS category_color,
             ch.name  AS channel_name,
             v.title  AS video_title
        FROM revenue_entries e
        JOIN categories c ON c.id = e.category_id
        LEFT JOIN channels ch ON ch.id = e.channel_id
        LEFT JOIN videos v ON v.id = e.video_id
        ${clause}`;

    if (categoryIds.length > 0) {
      const inClause = `e.category_id IN (${categoryIds.map(() => '?').join(', ')})`;
      sql += clause ? ` AND ${inClause}` : ` WHERE ${inClause}`;
      allParams.push(...categoryIds);
    }
    sql += ' ORDER BY e.date DESC, e.created_at DESC';

    return (this.db.prepare(sql).all(...(allParams as never[])) as unknown as EntryViewRow[]).map(
      toViewDomain,
    );
  }

  findById(id: string): RevenueEntry | null {
    const row = this.db.prepare('SELECT * FROM revenue_entries WHERE id = ?').get(id) as
      EntryRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateRevenueEntryInput): RevenueEntry {
    assertAcceptsRevenue(this.db, input.categoryId);
    const id = newId();
    const now = new Date().toISOString();

    this.db
      .prepare(
        `INSERT INTO revenue_entries
           (id, channel_id, category_id, video_id, date, amount_cents, label, notes,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.channelId ?? null,
        input.categoryId,
        input.videoId ?? null,
        input.date,
        input.amountCents,
        input.label,
        input.notes ?? null,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateRevenueEntryInput): RevenueEntry {
    const existing = this.findById(id);
    if (!existing) throw notFound('Revenu');
    if (input.categoryId !== undefined) assertAcceptsRevenue(this.db, input.categoryId);

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.channelId !== undefined) set('channel_id', input.channelId);
    if (input.categoryId !== undefined) set('category_id', input.categoryId);
    if (input.videoId !== undefined) set('video_id', input.videoId);
    if (input.date !== undefined) set('date', input.date);
    if (input.amountCents !== undefined) set('amount_cents', input.amountCents);
    if (input.label !== undefined) set('label', input.label);
    if (input.notes !== undefined) set('notes', input.notes);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE revenue_entries SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM revenue_entries WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Revenu');
  }

  sumByDate(filter: RevenueEntryFilter): Array<{
    date: IsoDate;
    categoryId: string;
    nature: 'cash' | 'in_kind';
    totalCents: number;
  }> {
    const { clause, params } = buildEntryWhere(filter, 'e');
    const rows = this.db
      .prepare(
        `SELECT e.date AS date,
                e.category_id AS category_id,
                c.nature AS nature,
                SUM(e.amount_cents) AS total
           FROM revenue_entries e
           JOIN categories c ON c.id = e.category_id
           ${clause}
          GROUP BY e.date, e.category_id
          ORDER BY e.date`,
      )
      .all(...(params as never[])) as unknown as Array<{
      date: string;
      category_id: string;
      nature: string;
      total: number;
    }>;

    return rows.map((r) => ({
      date: r.date,
      categoryId: r.category_id,
      nature: r.nature as 'cash' | 'in_kind',
      totalCents: r.total,
    }));
  }

  countInKind(filter: RevenueEntryFilter): number {
    const { clause, params } = buildEntryWhere(filter, 'e');
    const where = clause ? `${clause} AND c.nature = 'in_kind'` : "WHERE c.nature = 'in_kind'";
    return (
      this.db
        .prepare(
          `SELECT COUNT(*) AS n
             FROM revenue_entries e
             JOIN categories c ON c.id = e.category_id
             ${where}`,
        )
        .get(...(params as never[])) as { n: number }
    ).n;
  }

  sumByCategory(filter: RevenueEntryFilter): Array<{ categoryId: string; totalCents: number }> {
    const { clause, params } = buildEntryWhere(filter, 'e');
    const rows = this.db
      .prepare(
        `SELECT e.category_id AS category_id, SUM(e.amount_cents) AS total
           FROM revenue_entries e
           ${clause}
          GROUP BY e.category_id`,
      )
      .all(...(params as never[])) as unknown as Array<{ category_id: string; total: number }>;

    return rows.map((r) => ({ categoryId: r.category_id, totalCents: r.total }));
  }

  sumByVideo(
    videoIds: string[],
  ): Array<{ videoId: string; cashCents: number; inKindCents: number }> {
    if (videoIds.length === 0) return [];

    const rows = this.db
      .prepare(
        `SELECT e.video_id AS video_id,
                c.nature AS nature,
                SUM(e.amount_cents) AS total
           FROM revenue_entries e
           JOIN categories c ON c.id = e.category_id
          WHERE e.video_id IN (${placeholders(videoIds.length)})
          GROUP BY e.video_id, c.nature`,
      )
      .all(...(videoIds as never[])) as unknown as Array<{
      video_id: string;
      nature: string;
      total: number;
    }>;

    const byVideo = new Map<string, { videoId: string; cashCents: number; inKindCents: number }>();
    for (const row of rows) {
      const entry = byVideo.get(row.video_id) ?? {
        videoId: row.video_id,
        cashCents: 0,
        inKindCents: 0,
      };
      if (row.nature === 'in_kind') entry.inKindCents += row.total;
      else entry.cashCents += row.total;
      byVideo.set(row.video_id, entry);
    }
    return [...byVideo.values()];
  }
}
