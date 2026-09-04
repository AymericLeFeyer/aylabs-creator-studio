import type { DatabaseSync } from 'node:sqlite';
import type {
  PlanningSettings,
  PlanningSettingsInput,
} from '../../../domain/planning/entities/PlanningSettings.ts';
import type { PlanningSettingsRepository } from '../../../domain/planning/repositories/PlanningRepository.ts';

interface Row {
  id: string;
  calendar_base_url: string | null;
  calendar_token: string | null;
  target_calendar_id: string | null;
  busy_calendar_ids: string;
  slot_granularity_minutes: number;
  min_block_minutes: number;
  max_block_minutes: number;
  break_minutes: number;
  horizon_days: number;
  push_to_calendar: number;
  updated_at: string;
}

const toDomain = (row: Row): PlanningSettings => ({
  calendarBaseUrl: row.calendar_base_url,
  targetCalendarId: row.target_calendar_id,
  busyCalendarIds: row.busy_calendar_ids
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean),
  slotGranularityMinutes: row.slot_granularity_minutes,
  minBlockMinutes: row.min_block_minutes,
  maxBlockMinutes: row.max_block_minutes,
  breakMinutes: row.break_minutes,
  horizonDays: row.horizon_days,
  pushToCalendar: row.push_to_calendar === 1,
  updatedAt: row.updated_at,
});

const ROW_ID = 'default';

/**
 * Les réglages du planning, ligne unique.
 *
 * `token()` est la **seule** façon de lire le jeton, et il n'est appelé que par le
 * client HTTP. Le reste de l'application ne voit que `PlanningSettings`, où il n'existe
 * pas : même règle que le refresh token des chaînes, pour la même raison — ce qui ne
 * traverse jamais une route ne peut pas fuir par une capture d'écran.
 */
export class SqlitePlanningSettingsRepository implements PlanningSettingsRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  private row(): Row {
    const row = this.db
      .prepare('SELECT * FROM planning_settings WHERE id = ?')
      .get(ROW_ID) as unknown as Row | undefined;
    if (row) return row;

    // La migration insère la ligne ; ce filet ne sert qu'à une base recopiée à la main.
    const now = new Date().toISOString();
    this.db
      .prepare('INSERT INTO planning_settings (id, created_at, updated_at) VALUES (?, ?, ?)')
      .run(ROW_ID, now, now);
    return this.db
      .prepare('SELECT * FROM planning_settings WHERE id = ?')
      .get(ROW_ID) as unknown as Row;
  }

  get(): PlanningSettings {
    return toDomain(this.row());
  }

  token(): string | null {
    const token = this.row().calendar_token;
    return token && token.length > 0 ? token : null;
  }

  update(input: PlanningSettingsInput): PlanningSettings {
    this.row();

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      fields.push(`${column} = ?`);
      values.push(value);
    };

    if (input.calendarBaseUrl !== undefined) {
      set('calendar_base_url', input.calendarBaseUrl?.replace(/\/+$/, '') || null);
    }
    // Absent = on conserve. `""` = on efface. Un jeton ne se ressaisit pas pour
    // corriger une case à cocher.
    if (input.calendarToken !== undefined) {
      set('calendar_token', input.calendarToken ? input.calendarToken : null);
    }
    if (input.targetCalendarId !== undefined) {
      set('target_calendar_id', input.targetCalendarId || null);
    }
    if (input.busyCalendarIds !== undefined) {
      set('busy_calendar_ids', input.busyCalendarIds.join(','));
    }
    if (input.slotGranularityMinutes !== undefined) {
      set('slot_granularity_minutes', input.slotGranularityMinutes);
    }
    if (input.minBlockMinutes !== undefined) set('min_block_minutes', input.minBlockMinutes);
    if (input.maxBlockMinutes !== undefined) set('max_block_minutes', input.maxBlockMinutes);
    if (input.breakMinutes !== undefined) set('break_minutes', input.breakMinutes);
    if (input.horizonDays !== undefined) set('horizon_days', input.horizonDays);
    if (input.pushToCalendar !== undefined) set('push_to_calendar', input.pushToCalendar ? 1 : 0);

    if (fields.length > 0) {
      set('updated_at', new Date().toISOString());
      values.push(ROW_ID);
      this.db
        .prepare(`UPDATE planning_settings SET ${fields.join(', ')} WHERE id = ?`)
        .run(...(values as never[]));
    }

    return this.get();
  }
}
