import type { DatabaseSync } from 'node:sqlite';
import type { Company, UpdateCompanyInput } from '../../../domain/legal/entities/Company.ts';
import type { CompanyRepository } from '../../../domain/legal/repositories/LegalRepository.ts';

/** Identifiant de l'unique ligne : la table ne porte qu'une société. */
const ROW_ID = 'default';

interface CompanyRow {
  id: string;
  name: string;
  legal_form: string | null;
  siret: string | null;
  vat_number: string | null;
  address: string | null;
  founded_on: string | null;
  notes: string | null;
  updated_at: string;
}

const toDomain = (row: CompanyRow): Company => ({
  id: row.id,
  name: row.name,
  legalForm: row.legal_form,
  siret: row.siret,
  vatNumber: row.vat_number,
  address: row.address,
  foundedOn: row.founded_on,
  notes: row.notes,
  updatedAt: row.updated_at,
});

export class SqliteCompanyRepository implements CompanyRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  get(): Company {
    const row = this.db.prepare('SELECT * FROM company WHERE id = ?').get(ROW_ID) as
      CompanyRow | undefined;
    // La migration insère la ligne ; ce filet ne sert qu'à une base bricolée à la main.
    if (!row) {
      this.db
        .prepare('INSERT INTO company (id, name, updated_at) VALUES (?, ?, ?)')
        .run(ROW_ID, '', new Date().toISOString());
      return this.get();
    }
    return toDomain(row);
  }

  update(input: UpdateCompanyInput): Company {
    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.name !== undefined) set('name', input.name);
    if (input.legalForm !== undefined) set('legal_form', input.legalForm);
    if (input.siret !== undefined) set('siret', input.siret);
    if (input.vatNumber !== undefined) set('vat_number', input.vatNumber);
    if (input.address !== undefined) set('address', input.address);
    if (input.foundedOn !== undefined) set('founded_on', input.foundedOn);
    if (input.notes !== undefined) set('notes', input.notes);

    if (fields.length === 0) return this.get();

    set('updated_at', new Date().toISOString());
    values.push(ROW_ID);
    this.db
      .prepare(`UPDATE company SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.get();
  }
}
