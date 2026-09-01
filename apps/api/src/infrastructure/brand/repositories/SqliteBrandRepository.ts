import type { DatabaseSync } from 'node:sqlite';
import type {
  Brand,
  BrandStats,
  CreateBrandInput,
  UpdateBrandInput,
} from '../../../domain/brand/entities/Brand.ts';
import type {
  BrandFilter,
  BrandRepository,
  BrandStatsFilter,
} from '../../../domain/brand/repositories/BrandRepository.ts';
import { placeholders } from '../../db/filters.ts';
import { newId } from '../../../shared/id.ts';
import { conflict, notFound } from '../../../shared/errors.ts';

interface BrandRow {
  id: string;
  name: string;
  website: string | null;
  contact_name: string | null;
  contact_email: string | null;
  color: string;
  notes: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: BrandRow): Brand => ({
  id: row.id,
  name: row.name,
  website: row.website,
  contactName: row.contact_name,
  contactEmail: row.contact_email,
  color: row.color,
  notes: row.notes,
  isArchived: row.is_archived === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Couleurs attribuées en rotation à la création, comme pour les chaînes.
 *
 * Une couleur par défaut unique rendrait les classements du dashboard illisibles : six
 * barres grises ne se distinguent pas. La rotation garantit une palette variée sans
 * jamais rien demander à la création — le nom suffit.
 */
const DEFAULT_COLORS = [
  '#ef4444',
  '#3b82f6',
  '#22c55e',
  '#f59e0b',
  '#a855f7',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

/**
 * Restriction de chaîne commune aux produits et aux sponsos.
 *
 * Même convention que `buildEntryWhere` pour les revenus : une sélection de chaînes
 * garde les lignes non rattachées, parce qu'un produit reçu « pour la marque » sans
 * chaîne décidée compte quand même dans ce que cette marque a donné.
 */
const channelClause = (alias: string, channelIds: string[]): { sql: string; params: string[] } =>
  channelIds.length === 0
    ? { sql: '', params: [] }
    : {
        sql: ` AND (${alias}.channel_id IN (${placeholders(channelIds.length)})
                    OR ${alias}.channel_id IS NULL)`,
        params: channelIds,
      };

export class SqliteBrandRepository implements BrandRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(filter: BrandFilter = {}): Brand[] {
    const clause = filter.includeArchived ? '' : 'WHERE is_archived = 0';
    const rows = this.db
      .prepare(`SELECT * FROM brands ${clause} ORDER BY is_archived, name COLLATE NOCASE`)
      .all() as unknown as BrandRow[];
    return rows.map(toDomain);
  }

  findById(id: string): Brand | null {
    const row = this.db.prepare('SELECT * FROM brands WHERE id = ?').get(id) as
      BrandRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateBrandInput): Brand {
    const id = newId();
    const now = new Date().toISOString();
    const count = (this.db.prepare('SELECT COUNT(*) AS n FROM brands').get() as { n: number }).n;
    const color = input.color ?? DEFAULT_COLORS[count % DEFAULT_COLORS.length]!;

    this.db
      .prepare(
        `INSERT INTO brands
           (id, name, website, contact_name, contact_email, color, notes,
            is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        id,
        input.name,
        input.website ?? null,
        input.contactName ?? null,
        input.contactEmail ?? null,
        color,
        input.notes ?? null,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateBrandInput): Brand {
    const existing = this.findById(id);
    if (!existing) throw notFound('Marque');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.name !== undefined) set('name', input.name);
    if (input.website !== undefined) set('website', input.website);
    if (input.contactName !== undefined) set('contact_name', input.contactName);
    if (input.contactEmail !== undefined) set('contact_email', input.contactEmail);
    if (input.color !== undefined) set('color', input.color);
    if (input.notes !== undefined) set('notes', input.notes);
    if (input.isArchived !== undefined) set('is_archived', input.isArchived ? 1 : 0);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE brands SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  /**
   * Suppression refusée dès qu'un produit ou une sponso s'y rattache.
   * Détacher silencieusement viderait les classements du dashboard sans prévenir :
   * l'archivage est là pour sortir une marque de la vue sans perdre son historique.
   */
  delete(id: string): void {
    const linked = this.db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM products WHERE brand_id = ?) AS products,
                (SELECT COUNT(*) FROM sponsorships WHERE brand_id = ?) AS sponsorships`,
      )
      .get(id, id) as { products: number; sponsorships: number };

    if (linked.products > 0 || linked.sponsorships > 0) {
      throw conflict(
        `Cette marque porte ${linked.products} produit(s) et ${linked.sponsorships} sponso(s). Archive-la plutôt que de la supprimer.`,
      );
    }

    const result = this.db.prepare('DELETE FROM brands WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Marque');
  }

  /**
   * Classements du dashboard.
   *
   * Trois lectures agrégées plutôt qu'une jointure triple : les trois n'ont ni la même
   * table de départ ni la même colonne de date (réception, paiement, échéance), et une
   * seule requête produirait un produit cartésien entre produits et sponsos.
   */
  stats(filter: BrandStatsFilter): BrandStats[] {
    const channelIds = filter.channelIds ?? [];
    const { from, to } = filter.range;

    const products = this.db
      .prepare(
        `SELECT p.brand_id AS brand_id, COUNT(*) AS n, SUM(p.value_cents) AS total
           FROM products p
          WHERE p.status = 'received'
            AND p.received_at BETWEEN ? AND ?
            ${channelClause('p', channelIds).sql}
          GROUP BY p.brand_id`,
      )
      .all(from, to, ...(channelClause('p', channelIds).params as never[])) as unknown as Array<{
      brand_id: string | null;
      n: number;
      total: number;
    }>;

    const paid = this.db
      .prepare(
        `SELECT s.brand_id AS brand_id, COUNT(*) AS n, SUM(s.amount_cents) AS total
           FROM sponsorships s
          WHERE s.status = 'paid'
            AND s.paid_at BETWEEN ? AND ?
            ${channelClause('s', channelIds).sql}
          GROUP BY s.brand_id`,
      )
      .all(from, to, ...(channelClause('s', channelIds).params as never[])) as unknown as Array<{
      brand_id: string | null;
      n: number;
      total: number;
    }>;

    // L'argent promis n'a pas de date d'encaissement : on ne le borne pas sur la période,
    // sinon une sponso signée sans échéance disparaîtrait du « à encaisser ».
    const pending = this.db
      .prepare(
        `SELECT s.brand_id AS brand_id, SUM(s.amount_cents) AS total
           FROM sponsorships s
          WHERE s.status IN ('discussion','todo','in_progress')
            ${channelClause('s', channelIds).sql}
          GROUP BY s.brand_id`,
      )
      .all(...(channelClause('s', channelIds).params as never[])) as unknown as Array<{
      brand_id: string | null;
      total: number;
    }>;

    const brands = new Map(this.findAll({ includeArchived: true }).map((b) => [b.id, b]));
    const stats = new Map<string, BrandStats>();

    // Les lignes sans marque sont regroupées sous une entrée « Sans marque » : les
    // ignorer ferait un classement dont la somme ne retombe pas sur les totaux.
    const bucket = (brandId: string | null): BrandStats => {
      const key = brandId ?? '__none__';
      const existing = stats.get(key);
      if (existing) return existing;

      const brand = brandId ? brands.get(brandId) : undefined;
      const created: BrandStats = {
        brandId: key,
        brandName: brand?.name ?? 'Sans marque',
        color: brand?.color ?? '#94a3b8',
        productsCount: 0,
        productsValueCents: 0,
        sponsorshipsPaidCount: 0,
        sponsorshipsPaidCents: 0,
        sponsorshipsPendingCents: 0,
      };
      stats.set(key, created);
      return created;
    };

    for (const row of products) {
      const entry = bucket(row.brand_id);
      entry.productsCount += row.n;
      entry.productsValueCents += row.total ?? 0;
    }
    for (const row of paid) {
      const entry = bucket(row.brand_id);
      entry.sponsorshipsPaidCount += row.n;
      entry.sponsorshipsPaidCents += row.total ?? 0;
    }
    for (const row of pending) {
      bucket(row.brand_id).sponsorshipsPendingCents += row.total ?? 0;
    }

    return [...stats.values()];
  }
}
