import type { DatabaseSync } from 'node:sqlite';
import type { WorkHours, WorkHoursInput } from '../../../domain/planning/entities/WorkHours.ts';
import type { WorkHoursRepository } from '../../../domain/planning/repositories/PlanningRepository.ts';
import { newId } from '../../../shared/id.ts';

interface Row {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  created_at: string;
  updated_at: string;
}

const toDomain = (row: Row): WorkHours => ({
  id: row.id,
  weekday: row.weekday,
  startTime: row.start_time,
  endTime: row.end_time,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/**
 * Les horaires de travail de la semaine type.
 *
 * L'écriture est un **remplacement total** : la grille se règle d'un bloc, et faire des
 * différences ligne à ligne demanderait des identifiants stables côté formulaire pour
 * un objet qui n'en a aucun besoin — on décoche une case, on décale une heure, on
 * enregistre.
 */
export class SqliteWorkHoursRepository implements WorkHoursRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  findAll(): WorkHours[] {
    const rows = this.db
      .prepare('SELECT * FROM work_hours ORDER BY weekday, start_time')
      .all() as unknown as Row[];
    return rows.map(toDomain);
  }

  replaceAll(input: WorkHoursInput[]): WorkHours[] {
    const now = new Date().toISOString();
    this.db.exec('BEGIN');
    try {
      this.db.exec('DELETE FROM work_hours');
      const insert = this.db.prepare(
        `INSERT INTO work_hours (id, weekday, start_time, end_time, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      for (const range of input) {
        if (range.endTime <= range.startTime) continue;
        insert.run(newId(), range.weekday, range.startTime, range.endTime, now, now);
      }
      this.db.exec('COMMIT');
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
    return this.findAll();
  }
}
