import type { DatabaseSync } from 'node:sqlite';
import type { Branding, BrandingIconKey } from '../../../domain/branding/entities/Branding.ts';
import type { BrandingRepository } from '../../../domain/branding/repositories/BrandingRepository.ts';
import { newId } from '../../../shared/id.ts';

interface BrandingRow {
  name: string | null;
  logo_version: string | null;
  updated_at: string;
}

/** CRUD nu, sans use case : changer de nom ou de logo n'a aucun effet de bord. */
export class SqliteBrandingRepository implements BrandingRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  get(): Branding {
    const row = this.db
      .prepare("SELECT name, logo_version, updated_at FROM app_branding WHERE id = 'default'")
      .get() as unknown as BrandingRow | undefined;
    return {
      name: row?.name ?? null,
      logoVersion: row?.logo_version ?? null,
      updatedAt: row?.updated_at ?? new Date(0).toISOString(),
    };
  }

  setName(name: string | null): Branding {
    this.db
      .prepare("UPDATE app_branding SET name = ?, updated_at = ? WHERE id = 'default'")
      .run(name, new Date().toISOString());
    return this.get();
  }

  setLogo(icons: Record<BrandingIconKey, Uint8Array>): Branding {
    const insert = this.db.prepare(
      `INSERT INTO app_branding_icons (key, data) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET data = excluded.data`,
    );
    this.db.exec('BEGIN');
    try {
      for (const [key, data] of Object.entries(icons)) insert.run(key, data);
      this.db
        .prepare("UPDATE app_branding SET logo_version = ?, updated_at = ? WHERE id = 'default'")
        .run(newId().slice(0, 12), new Date().toISOString());
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.get();
  }

  clearLogo(): Branding {
    this.db.exec('BEGIN');
    try {
      this.db.exec('DELETE FROM app_branding_icons');
      this.db
        .prepare("UPDATE app_branding SET logo_version = NULL, updated_at = ? WHERE id = 'default'")
        .run(new Date().toISOString());
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.get();
  }

  icon(key: BrandingIconKey): Uint8Array | null {
    const row = this.db.prepare('SELECT data FROM app_branding_icons WHERE key = ?').get(key) as
      { data: Uint8Array } | undefined;
    return row?.data ?? null;
  }
}
