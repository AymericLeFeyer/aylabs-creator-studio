import type { DatabaseSync } from 'node:sqlite';
import type { CreateIdeaInput, Idea, UpdateIdeaInput } from '../../../domain/idea/entities/Idea.ts';
import type { IdeaRepository } from '../../../domain/idea/repositories/IdeaRepository.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface IdeaRow {
  id: string;
  text: string;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: IdeaRow): Idea => ({
  id: row.id,
  text: row.text,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqliteIdeaRepository implements IdeaRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(): Idea[] {
    const rows = this.db
      .prepare('SELECT * FROM ideas ORDER BY created_at DESC')
      .all() as unknown as IdeaRow[];
    return rows.map(toDomain);
  }

  findById(id: string): Idea | null {
    const row = this.db.prepare('SELECT * FROM ideas WHERE id = ?').get(id) as IdeaRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateIdeaInput): Idea {
    const id = newId();
    const now = new Date().toISOString();
    this.db
      .prepare('INSERT INTO ideas (id, text, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run(id, input.text, now, now);
    return this.findById(id)!;
  }

  update(id: string, input: UpdateIdeaInput): Idea {
    const existing = this.findById(id);
    if (!existing) throw notFound('Idée');
    if (input.text === undefined) return existing;

    this.db
      .prepare('UPDATE ideas SET text = ?, updated_at = ? WHERE id = ?')
      .run(input.text, new Date().toISOString(), id);
    return this.findById(id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM ideas WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Idée');
  }
}
