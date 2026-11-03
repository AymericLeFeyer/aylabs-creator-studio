import type { DatabaseSync } from 'node:sqlite';
import type {
  BrandContactInput,
  BrandContactSource,
  BrandContactView,
  SeenContact,
  UpdateBrandContactInput,
} from '../../../domain/brand/entities/BrandContact.ts';
import type {
  BrandContactFilter,
  BrandContactRepository,
} from '../../../domain/brand/repositories/BrandContactRepository.ts';
import { newId } from '../../../shared/id.ts';
import { conflict, notFound } from '../../../shared/errors.ts';

interface ContactRow {
  id: string;
  brand_id: string;
  email: string;
  name: string;
  role: string;
  phone: string;
  notes: string;
  source: BrandContactSource;
  last_contact_at: string | null;
  hidden_at: string | null;
  created_at: string;
  updated_at: string;
  brand_name: string;
  brand_color: string;
}

const toView = (row: ContactRow): BrandContactView => ({
  id: row.id,
  brandId: row.brand_id,
  email: row.email,
  name: row.name,
  role: row.role,
  phone: row.phone,
  notes: row.notes,
  source: row.source,
  lastContactAt: row.last_contact_at,
  hiddenAt: row.hidden_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  brandName: row.brand_name,
  brandColor: row.brand_color,
});

const VIEW_SQL = `
  SELECT c.*, b.name AS brand_name, b.color AS brand_color
  FROM brand_contacts c
  JOIN brands b ON b.id = c.brand_id
`;

export class SqliteBrandContactRepository implements BrandContactRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(filter: BrandContactFilter = {}): BrandContactView[] {
    const where = ['c.hidden_at IS NULL'];
    const params: string[] = [];
    if (filter.brandId) {
      where.push('c.brand_id = ?');
      params.push(filter.brandId);
    }
    const search = filter.search?.trim().toLowerCase();
    if (search) {
      where.push(
        '(lower(c.name) LIKE ? OR c.email LIKE ? OR lower(c.role) LIKE ? OR lower(b.name) LIKE ?)',
      );
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    const rows = this.db
      .prepare(
        `${VIEW_SQL} WHERE ${where.join(' AND ')}
         ORDER BY c.last_contact_at IS NULL, c.last_contact_at DESC, c.name COLLATE NOCASE`,
      )
      .all(...params) as unknown as ContactRow[];
    return rows.map(toView);
  }

  findById(id: string): BrandContactView | null {
    const row = this.db.prepare(`${VIEW_SQL} WHERE c.id = ?`).get(id) as ContactRow | undefined;
    return row ? toView(row) : null;
  }

  create(brandId: string, input: BrandContactInput): BrandContactView {
    if (!this.db.prepare('SELECT 1 FROM brands WHERE id = ?').get(brandId)) {
      throw notFound('Marque');
    }
    const email = input.email.trim().toLowerCase();
    const now = new Date().toISOString();
    const existing = this.db
      .prepare('SELECT id, hidden_at FROM brand_contacts WHERE brand_id = ? AND email = ?')
      .get(brandId, email) as { id: string; hidden_at: string | null } | undefined;

    if (existing) {
      if (!existing.hidden_at) throw conflict('Ce contact est déjà dans le carnet de la marque');
      this.db
        .prepare('UPDATE brand_contacts SET hidden_at = NULL, updated_at = ? WHERE id = ?')
        .run(now, existing.id);
      return this.update(existing.id, input);
    }

    const id = newId();
    this.db
      .prepare(
        `INSERT INTO brand_contacts
           (id, brand_id, email, name, role, phone, notes, source, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?)`,
      )
      .run(
        id,
        brandId,
        email,
        input.name?.trim() ?? '',
        input.role?.trim() ?? '',
        input.phone?.trim() ?? '',
        input.notes?.trim() ?? '',
        now,
        now,
      );
    return this.findById(id)!;
  }

  update(id: string, input: UpdateBrandContactInput): BrandContactView {
    const current = this.findById(id);
    if (!current) throw notFound('Contact');
    const email = input.email?.trim().toLowerCase() ?? current.email;
    if (email !== current.email) {
      const taken = this.db
        .prepare('SELECT 1 FROM brand_contacts WHERE brand_id = ? AND email = ? AND id <> ?')
        .get(current.brandId, email, id);
      if (taken) throw conflict('Cette adresse est déjà dans le carnet de la marque');
    }
    this.db
      .prepare(
        `UPDATE brand_contacts
           SET email = ?, name = ?, role = ?, phone = ?, notes = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        email,
        input.name?.trim() ?? current.name,
        input.role?.trim() ?? current.role,
        input.phone?.trim() ?? current.phone,
        input.notes?.trim() ?? current.notes,
        new Date().toISOString(),
        id,
      );
    return this.findById(id)!;
  }

  hide(id: string): void {
    const now = new Date().toISOString();
    const result = this.db
      .prepare('UPDATE brand_contacts SET hidden_at = ?, updated_at = ? WHERE id = ?')
      .run(now, now, id);
    if (result.changes === 0) throw notFound('Contact');
  }

  recordSeen(brandId: string, contacts: SeenContact[]): void {
    if (contacts.length === 0) return;
    const now = new Date().toISOString();
    // Un nom déjà saisi l'emporte : celui d'un en-tête de mail est souvent « Service presse ».
    const upsert = this.db.prepare(
      `INSERT INTO brand_contacts
         (id, brand_id, email, name, source, last_contact_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'mail', ?, ?, ?)
       ON CONFLICT (brand_id, email) DO UPDATE SET
         name = CASE WHEN brand_contacts.name = '' THEN excluded.name ELSE brand_contacts.name END,
         last_contact_at = CASE
           WHEN brand_contacts.last_contact_at IS NULL
             OR excluded.last_contact_at > brand_contacts.last_contact_at
           THEN excluded.last_contact_at ELSE brand_contacts.last_contact_at END,
         updated_at = excluded.updated_at`,
    );
    this.db.exec('BEGIN');
    try {
      for (const contact of contacts) {
        upsert.run(newId(), brandId, contact.email, contact.name, contact.date, now, now);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
