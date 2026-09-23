import type { DatabaseSync } from 'node:sqlite';
import type {
  DomadooSnapshotRepository,
  DomadooSnapshotRow,
} from '../../../domain/integration/repositories/DomadooSnapshotRepository.ts';
import type { IsoDate } from '../../../shared/dates.ts';

interface Row {
  date: string;
  clicks: number | null;
  unique_clicks: number | null;
  approved_sales: number | null;
  earnings_cents: number | null;
  payments_cents: number | null;
  waiting_payments_cents: number | null;
  balance_cents: number | null;
  waiting_sales_cents: number | null;
}

const toDomain = (row: Row): DomadooSnapshotRow => ({
  date: row.date,
  clicks: row.clicks,
  uniqueClicks: row.unique_clicks,
  approvedSales: row.approved_sales,
  earningsCents: row.earnings_cents,
  paymentsCents: row.payments_cents,
  waitingPaymentsCents: row.waiting_payments_cents,
  balanceCents: row.balance_cents,
  waitingSalesCents: row.waiting_sales_cents,
});

export class SqliteDomadooSnapshotRepository implements DomadooSnapshotRepository {
  private readonly db: DatabaseSync;

  constructor(db: DatabaseSync) {
    this.db = db;
  }

  upsert(row: DomadooSnapshotRow): void {
    this.db
      .prepare(
        `INSERT INTO domadoo_snapshots
           (date, clicks, unique_clicks, approved_sales, earnings_cents, payments_cents,
            waiting_payments_cents, balance_cents, waiting_sales_cents, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(date) DO UPDATE SET
           clicks = excluded.clicks,
           unique_clicks = excluded.unique_clicks,
           approved_sales = excluded.approved_sales,
           earnings_cents = excluded.earnings_cents,
           payments_cents = excluded.payments_cents,
           waiting_payments_cents = excluded.waiting_payments_cents,
           balance_cents = excluded.balance_cents,
           waiting_sales_cents = excluded.waiting_sales_cents`,
      )
      .run(
        row.date,
        row.clicks,
        row.uniqueClicks,
        row.approvedSales,
        row.earningsCents,
        row.paymentsCents,
        row.waitingPaymentsCents,
        row.balanceCents,
        row.waitingSalesCents,
        new Date().toISOString(),
      );
  }

  findInRange(from: IsoDate, to: IsoDate): DomadooSnapshotRow[] {
    const rows = this.db
      .prepare('SELECT * FROM domadoo_snapshots WHERE date >= ? AND date <= ? ORDER BY date')
      .all(from, to) as unknown as Row[];
    return rows.map(toDomain);
  }

  findBefore(date: IsoDate): DomadooSnapshotRow | null {
    const row = this.db
      .prepare('SELECT * FROM domadoo_snapshots WHERE date < ? ORDER BY date DESC LIMIT 1')
      .get(date) as Row | undefined;
    return row ? toDomain(row) : null;
  }

  findAtOrBefore(date: IsoDate): DomadooSnapshotRow | null {
    const row = this.db
      .prepare('SELECT * FROM domadoo_snapshots WHERE date <= ? ORDER BY date DESC LIMIT 1')
      .get(date) as Row | undefined;
    return row ? toDomain(row) : null;
  }

  findFirstDate(): IsoDate | null {
    const row = this.db.prepare('SELECT MIN(date) AS date FROM domadoo_snapshots').get() as {
      date: string | null;
    };
    return row.date;
  }
}
