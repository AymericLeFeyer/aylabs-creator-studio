/**
 * Les lignes des deux fenêtres Domadoo (`DomadooExport`), **une définition par ligne** :
 * elles alimentent à la fois les deux cartes de l'onglet Domadoo et le catalogue du
 * dashboard, où chaque ligne se pose en grand chiffre (`domadoo.<id>`).
 *
 * Ce fichier n'exporte aucun composant (`react-refresh/only-export-components`).
 */
export type DomadooWindow = 'last30days' | 'total';

export const DOMADOO_WINDOWS: Record<DomadooWindow, string> = {
  last30days: '30 derniers jours',
  total: 'Total depuis toujours',
};

export interface DomadooRow {
  /** `last30days.clicks` — le suffixe de l'identifiant de bloc. */
  id: string;
  window: DomadooWindow;
  field: string;
  label: string;
  kind: 'count' | 'money';
  icon: 'click' | 'sale' | 'money' | 'balance';
}

const row = (
  window: DomadooWindow,
  field: string,
  label: string,
  kind: DomadooRow['kind'],
  icon: DomadooRow['icon'],
): DomadooRow => ({ id: `${window}.${field}`, window, field, label, kind, icon });

export const DOMADOO_ROWS: DomadooRow[] = [
  row('last30days', 'clicks', 'Clics', 'count', 'click'),
  row('last30days', 'uniquesClicks', 'Clics uniques', 'count', 'click'),
  row('last30days', 'approvedSales', 'Ventes validées', 'count', 'sale'),
  row('last30days', 'waitingSales', 'Ventes en attente', 'count', 'sale'),
  row('last30days', 'earnings', 'Gains', 'money', 'money'),
  row('last30days', 'waitingSalesTotal', 'Commissions en attente', 'money', 'money'),
  row('total', 'clicks', 'Clics', 'count', 'click'),
  row('total', 'uniquesClicks', 'Clics uniques', 'count', 'click'),
  row('total', 'approvedSales', 'Ventes validées', 'count', 'sale'),
  row('total', 'earnings', 'Gains', 'money', 'money'),
  row('total', 'payments', 'Versé', 'money', 'money'),
  row('total', 'waitingPayments', 'En attente de versement', 'money', 'balance'),
  row('total', 'balance', 'Solde', 'money', 'balance'),
];
