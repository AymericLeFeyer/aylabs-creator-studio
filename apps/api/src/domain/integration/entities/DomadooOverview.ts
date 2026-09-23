import type { Granularity, IsoDate } from '../../../shared/dates.ts';

/**
 * L'historique Domadoo, pour naviguer dans le passé.
 *
 * Même découpage FLUX / CUMUL que les autres séries du studio : les gains, clics et
 * ventes validées se **comptent** sur la période (différence de deux relevés cumulatifs,
 * plancher à zéro) ; le solde, l'en-attente de paiement et les ventes en attente
 * **s'observent** à un instant donné — on garde le dernier relevé connu du bucket, comme
 * les abonnés Instagram.
 */
export interface DomadooSeriesPoint {
  date: IsoDate;
  clicksGained: number | null;
  approvedSalesGained: number | null;
  earningsGainedCents: number | null;
  /** Dernier relevé connu du bucket, `null` avant le premier instantané. */
  balanceCents: number | null;
  waitingPaymentsCents: number | null;
  waitingSalesCents: number | null;
}

export interface DomadooTotals {
  clicksGained: number | null;
  approvedSalesGained: number | null;
  earningsGainedCents: number | null;
  /** Tel que connu à la fin de la période (`to`), pas une somme. */
  balanceCents: number | null;
  waitingPaymentsCents: number | null;
  waitingSalesCents: number | null;
  days: number;
}

export interface DomadooOverview {
  from: IsoDate;
  to: IsoDate;
  granularity: Granularity;
  series: DomadooSeriesPoint[];
  totals: DomadooTotals;
  previousTotals: DomadooTotals;
  /** `null` tant qu'aucune collecte n'a écrit d'instantané : l'écran doit le dire au lieu
   * de laisser lire une période vide comme "rien gagné". */
  firstSnapshotDate: IsoDate | null;
  lastUpdate: IsoDate | null;
}
