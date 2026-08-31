import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';

const euro = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

const euroCompact = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
});

const number = new Intl.NumberFormat('fr-FR');
const numberCompact = new Intl.NumberFormat('fr-FR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

/** Les montants arrivent en centimes : la conversion est centralisée ici. */
export const formatMoney = (cents: number): string => euro.format(cents / 100);
export const formatMoneyCompact = (cents: number): string => euroCompact.format(cents / 100);
export const formatNumber = (value: number): string => number.format(Math.round(value));
export const formatNumberCompact = (value: number): string => numberCompact.format(value);

export const formatPercent = (value: number | null): string =>
  value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)} %`;

/** Signe explicite : un solde d'abonnés négatif doit se voir immédiatement. */
export const formatSigned = (value: number): string =>
  `${value > 0 ? '+' : ''}${number.format(Math.round(value))}`;

export const formatHours = (hours: number): string => `${number.format(Math.round(hours))} h`;

/** Libellé d'un point de série, adapté à la granularité affichée. */
export const formatBucketLabel = (date: string, granularity: 'day' | 'week' | 'month'): string => {
  const parsed = parseISO(date);
  if (granularity === 'month') return format(parsed, 'LLL yyyy', { locale: fr });
  if (granularity === 'week') return `sem. ${format(parsed, 'dd MMM', { locale: fr })}`;
  return format(parsed, 'dd MMM', { locale: fr });
};

export const formatDate = (date: string): string =>
  format(parseISO(date), 'dd MMM yyyy', { locale: fr });

export const toIsoDate = (date: Date): string => format(date, 'yyyy-MM-dd');
