/**
 * Les chiffres Amazon posables un à un sur le dashboard (`amazon.<id>`).
 *
 * Deux familles, et le libellé dit laquelle : **le mois** tel qu'Amazon l'annonce à son
 * dernier relevé (exact, hors période), et **la période** choisie dans la barre, reconstruite
 * par différence de relevés (vide tant qu'il n'y a pas deux relevés). Ce fichier n'exporte
 * aucun composant (`react-refresh/only-export-components`).
 */
export type AmazonMetricField =
  | 'earningsCents'
  | 'clicks'
  | 'itemsOrdered'
  | 'itemsShipped'
  | 'shippedRevenueCents'
  | 'conversionRate'
  | 'waitingPaymentsCents';

export interface AmazonMetric {
  id: string;
  scope: 'month' | 'period';
  field: AmazonMetricField;
  label: string;
  kind: 'money' | 'count' | 'percent';
  icon: 'money' | 'click' | 'cart' | 'truck' | 'percent' | 'wallet';
}

export const AMAZON_METRICS: AmazonMetric[] = [
  {
    id: 'month.earnings',
    scope: 'month',
    field: 'earningsCents',
    label: 'Gains du mois',
    kind: 'money',
    icon: 'money',
  },
  {
    id: 'month.clicks',
    scope: 'month',
    field: 'clicks',
    label: 'Clics du mois',
    kind: 'count',
    icon: 'click',
  },
  {
    id: 'month.ordered',
    scope: 'month',
    field: 'itemsOrdered',
    label: 'Articles commandés',
    kind: 'count',
    icon: 'cart',
  },
  {
    id: 'month.conversion',
    scope: 'month',
    field: 'conversionRate',
    label: 'Conversion du mois',
    kind: 'percent',
    icon: 'percent',
  },
  {
    id: 'month.shippedRevenue',
    scope: 'month',
    field: 'shippedRevenueCents',
    label: 'Ventes expédiées',
    kind: 'money',
    icon: 'truck',
  },
  {
    id: 'waiting',
    scope: 'month',
    field: 'waitingPaymentsCents',
    label: 'Paiements en attente',
    kind: 'money',
    icon: 'wallet',
  },
  {
    id: 'period.earnings',
    scope: 'period',
    field: 'earningsCents',
    label: 'Gains sur la période',
    kind: 'money',
    icon: 'money',
  },
  {
    id: 'period.clicks',
    scope: 'period',
    field: 'clicks',
    label: 'Clics sur la période',
    kind: 'count',
    icon: 'click',
  },
  {
    id: 'period.conversion',
    scope: 'period',
    field: 'conversionRate',
    label: 'Conversion sur la période',
    kind: 'percent',
    icon: 'percent',
  },
];

const MONTH_LABEL = new Intl.DateTimeFormat('fr-FR', { month: 'short', year: '2-digit' });
const MONTH_LONG = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });

/** `2026-09` → « sept. 26 ». */
export const formatMonth = (month: string): string =>
  MONTH_LABEL.format(new Date(`${month}-01T00:00:00`));

/** `2026-09` → « septembre 2026 ». */
export const formatMonthLong = (month: string): string =>
  MONTH_LONG.format(new Date(`${month}-01T00:00:00`));
