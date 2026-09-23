/**
 * Contrat de `/api/domadoo/overview`, dupliqué depuis l'API comme tout le reste du front.
 * **Toute évolution doit être répercutée des deux côtés.**
 */

export interface DomadooSeriesPoint {
  date: string;
  clicksGained: number | null;
  approvedSalesGained: number | null;
  earningsGainedCents: number | null;
  balanceCents: number | null;
  waitingPaymentsCents: number | null;
  waitingSalesCents: number | null;
}

export interface DomadooTotals {
  clicksGained: number | null;
  approvedSalesGained: number | null;
  earningsGainedCents: number | null;
  balanceCents: number | null;
  waitingPaymentsCents: number | null;
  waitingSalesCents: number | null;
  days: number;
}

export interface DomadooOverview {
  from: string;
  to: string;
  granularity: 'day' | 'week' | 'month';
  series: DomadooSeriesPoint[];
  totals: DomadooTotals;
  previousTotals: DomadooTotals;
  /** `null` tant qu'aucune collecte n'a écrit d'instantané. */
  firstSnapshotDate: string | null;
  lastUpdate: string | null;
}

/**
 * L'instantané **brut** que Domadoo renvoie, tel que porté par
 * `IntegrationView.data` (`/api/integrations`) pour le fournisseur `domadoo` — pas
 * l'historique reconstruit ci-dessus, mais exactement ce que le site affiche : ses deux
 * fenêtres fixes (30 derniers jours, total depuis toujours) et les dernières ventes
 * relevées. Les montants sont en **euros**, pas en centimes : ce n'est pas un montant du
 * domaine (`revenue_entries`), c'est un contrat externe recopié tel quel.
 */
export interface DomadooSale {
  id: string;
  /** `AAAA-MM-JJ HH:MM:SS`, pas un ISO strict — Domadoo le renvoie avec un espace. */
  date: string;
  order: number | null;
  commission: number | null;
  approved: boolean;
}

export interface DomadooExport {
  last30days: {
    clicks: number | null;
    uniquesClicks: number | null;
    /** Nombre de ventes, pas un montant — voir `waitingSalesTotal` pour la valeur. */
    waitingSales: number | null;
    approvedSales: number | null;
    earnings: number | null;
    /** Somme des commissions en attente, tirée du relevé quotidien des ventes. */
    waitingSalesTotal: number | null;
  };
  total: {
    clicks: number | null;
    uniquesClicks: number | null;
    approvedSales: number | null;
    earnings: number | null;
    payments: number | null;
    waitingPayments: number | null;
    balance: number | null;
  };
  lastSales: DomadooSale[];
}
