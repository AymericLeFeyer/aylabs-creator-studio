import type { DatabaseSync } from 'node:sqlite';
import type {
  AffiliatePlatform,
  AffiliatePlatformView,
  CreateAffiliatePlatformInput,
  PlatformBrandRef,
  UpdateAffiliatePlatformInput,
} from '../../../domain/affiliate/entities/AffiliatePlatform.ts';
import type { AffiliatePlatformRepository } from '../../../domain/affiliate/repositories/AffiliatePlatformRepository.ts';
import type { DateRange } from '../../../domain/metrics/repositories/MetricsRepository.ts';
import { placeholders } from '../../db/filters.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface PlatformRow {
  id: string;
  name: string;
  description: string | null;
  url: string | null;
  image_url: string | null;
  color: string;
  notes: string | null;
  sort_order: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: PlatformRow): AffiliatePlatform => ({
  id: row.id,
  name: row.name,
  description: row.description,
  url: row.url,
  imageUrl: row.image_url,
  color: row.color,
  notes: row.notes,
  sortOrder: row.sort_order,
  isArchived: row.is_archived === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** Même palette que les marques et les chaînes, attribuée en rotation à la création. */
const DEFAULT_COLORS = [
  '#f59e0b',
  '#3b82f6',
  '#22c55e',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#ef4444',
  '#f97316',
];

export class SqliteAffiliatePlatformRepository implements AffiliatePlatformRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  /**
   * Les marques de chaque plateforme, en une requête pour tout le lot.
   * Pas de jointure sur la ligne principale : trois marques feraient trois lignes de
   * plateforme à dédupliquer, et le total d'argent serait compté trois fois.
   */
  private loadBrands(platformIds: string[]): Map<string, PlatformBrandRef[]> {
    const byPlatform = new Map<string, PlatformBrandRef[]>();
    if (platformIds.length === 0) return byPlatform;

    const rows = this.db
      .prepare(
        `SELECT pb.platform_id, b.id, b.name, b.color
           FROM affiliate_platform_brands pb
           JOIN brands b ON b.id = pb.brand_id
          WHERE pb.platform_id IN (${placeholders(platformIds.length)})
          ORDER BY b.name COLLATE NOCASE`,
      )
      .all(...(platformIds as never[])) as unknown as Array<{
      platform_id: string;
      id: string;
      name: string;
      color: string;
    }>;

    for (const row of rows) {
      const list = byPlatform.get(row.platform_id) ?? [];
      list.push({ id: row.id, name: row.name, color: row.color });
      byPlatform.set(row.platform_id, list);
    }
    return byPlatform;
  }

  /** Revenus rattachés, sur la période et depuis toujours, en une requête. */
  private loadEarnings(
    range?: DateRange,
  ): Map<string, { period: number; total: number; count: number }> {
    const rows = this.db
      .prepare(
        `SELECT platform_id,
                COALESCE(SUM(amount_cents), 0) AS total,
                COALESCE(SUM(CASE WHEN (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)
                                  THEN amount_cents ELSE 0 END), 0) AS period,
                COALESCE(SUM(CASE WHEN (? IS NULL OR date >= ?) AND (? IS NULL OR date <= ?)
                                  THEN 1 ELSE 0 END), 0) AS entries
           FROM revenue_entries
          WHERE platform_id IS NOT NULL
          GROUP BY platform_id`,
      )
      .all(
        range?.from ?? null,
        range?.from ?? null,
        range?.to ?? null,
        range?.to ?? null,
        range?.from ?? null,
        range?.from ?? null,
        range?.to ?? null,
        range?.to ?? null,
      ) as unknown as Array<{
      platform_id: string;
      total: number;
      period: number;
      entries: number;
    }>;

    return new Map(
      rows.map((row) => [
        row.platform_id,
        { period: row.period, total: row.total, count: row.entries },
      ]),
    );
  }

  findAll(options: { includeArchived?: boolean; range?: DateRange } = {}): AffiliatePlatformView[] {
    const clause = options.includeArchived ? '' : 'WHERE is_archived = 0';
    const rows = this.db
      .prepare(
        `SELECT * FROM affiliate_platforms ${clause} ORDER BY sort_order, name COLLATE NOCASE`,
      )
      .all() as unknown as PlatformRow[];

    const ids = rows.map((row) => row.id);
    const brands = this.loadBrands(ids);
    const earnings = this.loadEarnings(options.range);

    return rows.map((row) => {
      const money = earnings.get(row.id);
      return {
        ...toDomain(row),
        brands: brands.get(row.id) ?? [],
        earnedCents: money?.period ?? 0,
        totalEarnedCents: money?.total ?? 0,
        entriesCount: money?.count ?? 0,
      };
    });
  }

  findById(id: string): AffiliatePlatform | null {
    const row = this.db.prepare('SELECT * FROM affiliate_platforms WHERE id = ?').get(id) as
      PlatformRow | undefined;
    return row ? toDomain(row) : null;
  }

  /**
   * Réécrit **entièrement** la liste des marques d'une plateforme.
   *
   * Remplacer plutôt que fusionner : le formulaire envoie l'état complet des cases
   * cochées, et une fusion rendrait impossible le retrait d'une marque.
   */
  private setBrands(platformId: string, brandIds: string[]): void {
    this.db.prepare('DELETE FROM affiliate_platform_brands WHERE platform_id = ?').run(platformId);
    if (brandIds.length === 0) return;

    const stmt = this.db.prepare(
      `INSERT INTO affiliate_platform_brands (platform_id, brand_id)
       VALUES (?, ?) ON CONFLICT DO NOTHING`,
    );
    for (const brandId of brandIds) stmt.run(platformId, brandId);
  }

  create(input: CreateAffiliatePlatformInput): AffiliatePlatform {
    const id = newId();
    const now = new Date().toISOString();
    const count = (
      this.db.prepare('SELECT COUNT(*) AS n FROM affiliate_platforms').get() as { n: number }
    ).n;

    this.db.exec('BEGIN');
    try {
      this.db
        .prepare(
          `INSERT INTO affiliate_platforms
             (id, name, description, url, image_url, color, notes, sort_order, is_archived,
              created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        )
        .run(
          id,
          input.name,
          input.description ?? null,
          input.url ?? null,
          input.imageUrl ?? null,
          input.color ?? DEFAULT_COLORS[count % DEFAULT_COLORS.length]!,
          input.notes ?? null,
          input.sortOrder ?? count + 1,
          now,
          now,
        );
      this.setBrands(id, input.brandIds ?? []);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return this.findById(id)!;
  }

  update(id: string, input: UpdateAffiliatePlatformInput): AffiliatePlatform {
    const existing = this.findById(id);
    if (!existing) throw notFound('Plateforme');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.name !== undefined) set('name', input.name);
    if (input.description !== undefined) set('description', input.description);
    if (input.url !== undefined) set('url', input.url);
    if (input.imageUrl !== undefined) set('image_url', input.imageUrl);
    if (input.color !== undefined) set('color', input.color);
    if (input.notes !== undefined) set('notes', input.notes);
    if (input.sortOrder !== undefined) set('sort_order', input.sortOrder);
    if (input.isArchived !== undefined) set('is_archived', input.isArchived ? 1 : 0);

    this.db.exec('BEGIN');
    try {
      if (fields.length > 0) {
        set('updated_at', new Date().toISOString());
        values.push(id);
        this.db
          .prepare(`UPDATE affiliate_platforms SET ${fields.join(', ')} WHERE id = ?`)
          .run(...(values as never[]));
      }
      // `undefined` laisse les marques intactes ; un tableau vide les retire toutes.
      if (input.brandIds !== undefined) this.setBrands(id, input.brandIds);
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }

    return this.findById(id)!;
  }

  /**
   * Les liens vers les marques partent en cascade, les **revenus sont détachés**
   * (`ON DELETE SET NULL`) : supprimer une plateforme ne doit pas effacer les euros
   * qu'elle a rapportés — ils restent dans le chiffre d'affaires, sans rattachement.
   */
  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM affiliate_platforms WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Plateforme');
  }
}
