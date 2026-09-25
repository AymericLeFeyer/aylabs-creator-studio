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
  /** Ce que le chiffre veut dire, tel que Domadoo le calcule : le panneau de survol. */
  help: string;
}

/** Une définition par champ : les deux fenêtres parlent de la même chose. */
const HELP: Record<string, string> = {
  clicks: 'Clics sur tes liens Domadoo, chaque visite comptée.',
  uniquesClicks: 'Clics dédoublonnés : une même personne ne compte qu’une fois.',
  approvedSales: 'Commandes validées par Domadoo : la commission est acquise.',
  waitingSales:
    'Commandes passées via tes liens mais pas encore validées (délai de rétractation, retours).',
  earnings: 'Commissions des ventes validées.',
  waitingSalesTotal:
    'Somme des commissions des ventes en attente, tirée du relevé quotidien des ventes. Elle rejoindra les gains à la validation.',
  payments: 'Ce que Domadoo t’a déjà versé.',
  waitingPayments: 'Gains validés, en attente de versement.',
  balance: 'Solde du compte affilié : ce qui te reste dû.',
};

const row = (
  window: DomadooWindow,
  field: string,
  label: string,
  kind: DomadooRow['kind'],
  icon: DomadooRow['icon'],
): DomadooRow => ({
  id: `${window}.${field}`,
  window,
  field,
  label,
  kind,
  icon,
  help: HELP[field] ?? '',
});

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
