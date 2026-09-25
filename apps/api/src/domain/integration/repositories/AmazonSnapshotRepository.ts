import type { IsoDate } from '../../../shared/dates.ts';

/**
 * Un relevé quotidien d'Amazon Partenaires.
 *
 * **Ce sont des cumuls DU MOIS EN COURS**, remis à zéro le 1er — et non des totaux depuis
 * toujours comme ceux de Domadoo : le tableau de bord d'Amazon n'affiche que « ce mois ».
 * Le dernier relevé d'un mois vaut donc le total de ce mois, et le gain d'une journée se
 * lit par différence avec le relevé précédent **du même mois** (voir `GetAmazonOverview`).
 *
 * `conversionRate` n'est pas stocké : c'est un ratio (`itemsOrdered / clicks`), recalculé
 * sur n'importe quelle période plutôt que moyenné de travers.
 */
export interface AmazonSnapshotRow {
  date: IsoDate;
  clicks: number | null;
  itemsOrdered: number | null;
  itemsShipped: number | null;
  itemsReturned: number | null;
  shippedRevenueCents: number | null;
  earningsCents: number | null;
  /** Un état, observé à la date du relevé — pas un cumul du mois. */
  waitingPaymentsCents: number | null;
}

export interface AmazonSnapshotRepository {
  /** Un seul relevé par jour : la collecte suivante écrase le précédent. */
  upsert(row: AmazonSnapshotRow): void;
  findInRange(from: IsoDate, to: IsoDate): AmazonSnapshotRow[];
  /** Le dernier relevé strictement antérieur à la date donnée, `null` s'il n'y en a aucun. */
  findBefore(date: IsoDate): AmazonSnapshotRow | null;
  /** Le dernier relevé de chaque mois (`AAAA-MM`), du plus ancien au plus récent. */
  findMonthEnds(): AmazonSnapshotRow[];
  findFirstDate(): IsoDate | null;
}
