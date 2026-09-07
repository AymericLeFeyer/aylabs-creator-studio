import type { DatabaseSync } from 'node:sqlite';
import type {
  CreateScriptPresetInput,
  ScriptPreset,
  UpdateScriptPresetInput,
} from '../../../domain/script/entities/ScriptPreset.ts';
import type { ScriptPresetRepository } from '../../../domain/script/repositories/ScriptRepository.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

/**
 * Couleurs attribuées en rotation à la création, comme pour les marques et les chaînes.
 *
 * Un gabarit se reconnaît à son liseré dans le corps du script : six blocs de la même
 * teinte se liraient comme un seul, et il faudrait relire chaque étiquette.
 */
const DEFAULT_COLORS = [
  '#22c55e',
  '#3b82f6',
  '#a855f7',
  '#f59e0b',
  '#ec4899',
  '#14b8a6',
  '#ef4444',
  '#f97316',
];

interface PresetRow {
  id: string;
  label: string;
  description: string | null;
  content: string;
  color: string;
  sort_order: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: PresetRow): ScriptPreset => ({
  id: row.id,
  label: row.label,
  description: row.description,
  content: row.content,
  color: row.color,
  sortOrder: row.sort_order,
  isArchived: row.is_archived === 1,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqliteScriptPresetRepository implements ScriptPresetRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(includeArchived = false): ScriptPreset[] {
    const clause = includeArchived ? '' : 'WHERE is_archived = 0';
    const rows = this.db
      .prepare(`SELECT * FROM script_presets ${clause} ORDER BY sort_order, label`)
      .all() as unknown as PresetRow[];
    return rows.map(toDomain);
  }

  findById(id: string): ScriptPreset | null {
    const row = this.db.prepare('SELECT * FROM script_presets WHERE id = ?').get(id) as
      PresetRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateScriptPresetInput): ScriptPreset {
    const id = newId();
    const now = new Date().toISOString();
    const { n } = this.db.prepare('SELECT COUNT(*) AS n FROM script_presets').get() as {
      n: number;
    };
    const nextOrder =
      input.sortOrder ??
      (
        this.db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS n FROM script_presets').get() as {
          n: number;
        }
      ).n + 1;

    this.db
      .prepare(
        `INSERT INTO script_presets
           (id, label, description, content, color, sort_order, is_archived, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        id,
        input.label,
        input.description ?? null,
        input.content ?? '',
        input.color ?? DEFAULT_COLORS[n % DEFAULT_COLORS.length]!,
        nextOrder,
        now,
        now,
      );

    return this.findById(id)!;
  }

  update(id: string, input: UpdateScriptPresetInput): ScriptPreset {
    const existing = this.findById(id);
    if (!existing) throw notFound('Gabarit de script');

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.label !== undefined) set('label', input.label);
    if (input.description !== undefined) set('description', input.description);
    if (input.content !== undefined) set('content', input.content);
    if (input.color !== undefined) set('color', input.color);
    if (input.sortOrder !== undefined) set('sort_order', input.sortOrder);
    if (input.isArchived !== undefined) set('is_archived', input.isArchived ? 1 : 0);

    if (fields.length === 0) return existing;

    set('updated_at', new Date().toISOString());
    values.push(id);
    this.db
      .prepare(`UPDATE script_presets SET ${fields.join(', ')} WHERE id = ?`)
      .run(...(values as never[]));

    return this.findById(id)!;
  }

  /** L'ordre se réécrit en entier, jamais par échange de deux rangs. */
  reorder(ids: string[]): void {
    if (ids.length === 0) return;
    const stmt = this.db.prepare('UPDATE script_presets SET sort_order = ? WHERE id = ?');

    this.db.exec('BEGIN');
    try {
      ids.forEach((id, index) => stmt.run(index + 1, id));
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /**
   * Suppression **franche**, sans garde.
   *
   * Rien n'en dépend : les blocs déjà insérés dans un script en portent une copie
   * complète — libellé, couleur et texte — et ne référencent pas la ligne. Supprimer le
   * gabarit ne retire donc rien d'aucun script, il n'y a plus qu'à ne plus le proposer.
   */
  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM script_presets WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Gabarit de script');
  }
}
