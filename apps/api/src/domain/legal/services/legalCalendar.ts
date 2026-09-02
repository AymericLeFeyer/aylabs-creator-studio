import type { IsoDate } from '../../../shared/dates.ts';

/** Un mois calendaire, au format `AAAA-MM`. C'est la maille du tableau légal. */
export type MonthKey = string;

export const monthOf = (date: IsoDate): MonthKey => date.slice(0, 7);

/** Nombre de jours du mois : c'est lui qui borne un jour limite déclaré à 31. */
export const daysInMonth = (month: MonthKey): number => {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
};

/**
 * Échéance réelle d'une obligation sur un mois.
 *
 * Sans jour limite, c'est le **dernier jour du mois** : rien n'est en retard tant que
 * le mois n'est pas terminé, et une obligation sans date connue ne doit pas crier au
 * retard dès le 1er.
 */
export const dueDateOf = (month: MonthKey, dayOfMonth: number | null): IsoDate => {
  const last = daysInMonth(month);
  const day = dayOfMonth === null ? last : Math.min(Math.max(dayOfMonth, 1), last);
  return `${month}-${String(day).padStart(2, '0')}`;
};

/** Le mois précédent celui passé. */
export const previousMonth = (month: MonthKey): MonthKey => {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year!, monthNumber! - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
};

/**
 * Tous les mois de `from` à `to` inclus, **du plus récent au plus ancien** : le mois en
 * cours est celui qu'on traite, il doit être en tête sans faire défiler l'historique.
 *
 * Le garde-fou évite qu'une date de création saisie de travers (an 1900) ne produise
 * un tableau de mille lignes.
 */
export const enumerateMonthsDesc = (from: MonthKey, to: MonthKey, max = 180): MonthKey[] => {
  const months: MonthKey[] = [];
  let cursor = to;
  while (cursor >= from && months.length < max) {
    months.push(cursor);
    cursor = previousMonth(cursor);
  }
  return months;
};
