import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Un relevé quotidien Domadoo. Les champs cumulatifs (`clicks`, `approvedSales`,
 * `earningsCents`, `paymentsCents`, `balanceCents`) sont des totaux **depuis toujours**,
 * comme `channel_snapshots` ; `waitingPaymentsCents` et `waitingSalesCents` sont des
 * états observés à la date du relevé.
 */
export interface DomadooSnapshotRow {
  date: IsoDate;
  clicks: number | null;
  uniqueClicks: number | null;
  approvedSales: number | null;
  earningsCents: number | null;
  paymentsCents: number | null;
  waitingPaymentsCents: number | null;
  balanceCents: number | null;
  waitingSalesCents: number | null;
}

export interface DomadooSnapshotRepository {
  /** Un seul relevé par jour : la collecte suivante écrase le précédent. */
  upsert(row: DomadooSnapshotRow): void;
  findInRange(from: IsoDate, to: IsoDate): DomadooSnapshotRow[];
  /** Le dernier relevé strictement antérieur à la date donnée, `null` s'il n'y en a aucun. */
  findBefore(date: IsoDate): DomadooSnapshotRow | null;
  /** Le dernier relevé connu à la date donnée ou avant, `null` s'il n'y en a aucun. */
  findAtOrBefore(date: IsoDate): DomadooSnapshotRow | null;
  findFirstDate(): IsoDate | null;
}
