import type { DatabaseSync } from 'node:sqlite';
import type {
  DiscordSnapshotRepository,
  DiscordSnapshotRow,
} from '../../../domain/integration/repositories/DiscordSnapshotRepository.ts';

interface Row {
  fetched_at: string;
  members: number | null;
  members_online: number | null;
}

const toDomain = (row: Row): DiscordSnapshotRow => ({
  fetchedAt: row.fetched_at,
  members: row.members,
  membersOnline: row.members_online,
});

export class SqliteDiscordSnapshotRepository implements DiscordSnapshotRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  insert(row: DiscordSnapshotRow): void {
    this.db
      .prepare(
        `INSERT INTO discord_snapshots (fetched_at, members, members_online) VALUES (?, ?, ?)`,
      )
      .run(row.fetchedAt, row.members, row.membersOnline);
  }

  findInRange(from: string, to: string): DiscordSnapshotRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM discord_snapshots WHERE fetched_at >= ? AND fetched_at <= ? ORDER BY fetched_at`,
      )
      .all(from, `${to}T23:59:59.999Z`) as unknown as Row[];
    return rows.map(toDomain);
  }
}
