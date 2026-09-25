import type { DatabaseSync } from 'node:sqlite';
import type {
  AmazonSnapshotRepository,
  AmazonSnapshotRow,
} from '../../../domain/integration/repositories/AmazonSnapshotRepository.ts';
import type { IsoDate } from '../../../shared/dates.ts';

interface Row {
  date: string;
  clicks: number | null;
  items_ordered: number | null;
  items_shipped: number | null;
  items_returned: number | null;
  shipped_revenue_cents: number | null;
  earnings_cents: number | null;
  waiting_payments_cents: number | null;
}

const toDomain = (row: Row): AmazonSnapshotRow => ({
  date: row.date,
  clicks: row.clicks,
  itemsOrdered: row.items_ordered,
  itemsShipped: row.items_shipped,
  itemsReturned: row.items_returned,
  shippedRevenueCents: row.shipped_revenue_cents,
  earningsCents: row.earnings_cents,
  waitingPaymentsCents: row.waiting_payments_cents,
});

export class SqliteAmazonSnapshotRepository implements AmazonSnapshotRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  upsert(row: AmazonSnapshotRow): void {
    this.db
      .prepare(
        `INSERT INTO amazon_snapshots
           (date, clicks, items_ordered, items_shipped, items_returned, shipped_revenue_cents,
            earnings_cents, waiting_payments_cents, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           clicks = excluded.clicks,
           items_ordered = excluded.items_ordered,
           items_shipped = excluded.items_shipped,
           items_returned = excluded.items_returned,
           shipped_revenue_cents = excluded.shipped_revenue_cents,
           earnings_cents = excluded.earnings_cents,
           waiting_payments_cents = excluded.waiting_payments_cents`,
      )
      .run(
        row.date,
        row.clicks,
        row.itemsOrdered,
        row.itemsShipped,
        row.itemsReturned,
        row.shippedRevenueCents,
        row.earningsCents,
        row.waitingPaymentsCents,
        new Date().toISOString(),
      );
  }

  findInRange(from: IsoDate, to: IsoDate): AmazonSnapshotRow[] {
    const rows = this.db
      .prepare('SELECT * FROM amazon_snapshots WHERE date >= ? AND date <= ? ORDER BY date')
      .all(from, to) as unknown as Row[];
    return rows.map(toDomain);
  }

  findBefore(date: IsoDate): AmazonSnapshotRow | null {
    const row = this.db
      .prepare('SELECT * FROM amazon_snapshots WHERE date < ? ORDER BY date DESC LIMIT 1')
      .get(date) as Row | undefined;
    return row ? toDomain(row) : null;
  }

  findMonthEnds(): AmazonSnapshotRow[] {
    const rows = this.db
      .prepare(
        `SELECT s.* FROM amazon_snapshots s
         JOIN (SELECT MAX(date) AS date FROM amazon_snapshots GROUP BY substr(date, 1, 7)) m
           ON m.date = s.date
         ORDER BY s.date`,
      )
      .all() as unknown as Row[];
    return rows.map(toDomain);
  }

  findFirstDate(): IsoDate | null {
    const row = this.db.prepare('SELECT MIN(date) AS date FROM amazon_snapshots').get() as {
      date: string | null;
    };
    return row.date;
  }
}
