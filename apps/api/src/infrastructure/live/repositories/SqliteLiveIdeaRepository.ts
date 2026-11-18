import type { DatabaseSync } from 'node:sqlite';
import type { IsoDate } from '../../../shared/dates.ts';
import type {
  CreateLiveIdeaInput,
  LiveIdea,
  UpdateLiveIdeaInput,
} from '../../../domain/live/entities/LiveIdea.ts';
import type { LiveIdeaRepository } from '../../../domain/live/repositories/LiveIdeaRepository.ts';
import { newId } from '../../../shared/id.ts';
import { notFound } from '../../../shared/errors.ts';

interface LiveIdeaRow {
  id: string;
  title: string;
  notes: string;
  planned_date: string | null;
  start_time: string | null;
  duration_minutes: number;
  channel_id: string | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_DURATION = 120;

const toDomain = (row: LiveIdeaRow): LiveIdea => ({
  id: row.id,
  title: row.title,
  notes: row.notes,
  plannedDate: row.planned_date,
  startTime: row.start_time,
  durationMinutes: row.duration_minutes,
  channelId: row.channel_id,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class SqliteLiveIdeaRepository implements LiveIdeaRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(): LiveIdea[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM live_ideas
          ORDER BY planned_date IS NULL, planned_date, start_time, created_at DESC`,
      )
      .all() as unknown as LiveIdeaRow[];
    return rows.map(toDomain);
  }

  findInRange(from: IsoDate, to: IsoDate): LiveIdea[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM live_ideas
          WHERE planned_date BETWEEN ? AND ?
          ORDER BY planned_date, start_time IS NULL, start_time`,
      )
      .all(from, to) as unknown as LiveIdeaRow[];
    return rows.map(toDomain);
  }

  findById(id: string): LiveIdea | null {
    const row = this.db.prepare('SELECT * FROM live_ideas WHERE id = ?').get(id) as
      LiveIdeaRow | undefined;
    return row ? toDomain(row) : null;
  }

  create(input: CreateLiveIdeaInput): LiveIdea {
    const id = newId();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO live_ideas
           (id, title, notes, planned_date, start_time, duration_minutes, channel_id,
            created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.title,
        input.notes ?? '',
        input.plannedDate ?? null,
        input.startTime ?? null,
        input.durationMinutes ?? DEFAULT_DURATION,
        input.channelId ?? null,
        now,
        now,
      );
    return this.findById(id)!;
  }

  update(id: string, input: UpdateLiveIdeaInput): LiveIdea {
    const existing = this.findById(id);
    if (!existing) throw notFound('Live');

    // `undefined` = inchangé, `null` = effacé : on ne peut pas se contenter de `??`.
    const pick = <T>(next: T | undefined, current: T): T => (next === undefined ? current : next);
    this.db
      .prepare(
        `UPDATE live_ideas
            SET title = ?, notes = ?, planned_date = ?, start_time = ?,
                duration_minutes = ?, channel_id = ?, updated_at = ?
          WHERE id = ?`,
      )
      .run(
        pick(input.title, existing.title),
        pick(input.notes, existing.notes),
        pick(input.plannedDate, existing.plannedDate),
        pick(input.startTime, existing.startTime),
        pick(input.durationMinutes, existing.durationMinutes),
        pick(input.channelId, existing.channelId),
        new Date().toISOString(),
        id,
      );
    return this.findById(id)!;
  }

  delete(id: string): void {
    const result = this.db.prepare('DELETE FROM live_ideas WHERE id = ?').run(id);
    if (result.changes === 0) throw notFound('Live');
  }
}
