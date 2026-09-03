import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  getQuarter,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subMonths,
  subQuarters,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import { format } from 'date-fns';
import { toIsoDate } from '../../../shared/format.ts';

/**
 * Une période calendaire concrète : un mois, un trimestre, une année précis.
 *
 * À distinguer des **préréglages** (`PeriodPreset`), qui sont relatifs à aujourd'hui et
 * se recalculent à chaque chargement. Ici les bornes sont figées : « Août 2026 » désigne
 * août 2026 pour toujours. C'est ce qui permet de revenir sur un mois clos sans saisir
 * deux dates à la main.
 */
export interface CalendarPeriod {
  /** Identifiant stable, pour repérer l'entrée active dans le menu. */
  id: string;
  label: string;
  from: string;
  to: string;
}

/** Nombre de mois passés proposés. Au-delà, on passe par les trimestres ou les années. */
const PAST_MONTHS = 12;

/** Trimestres passés proposés : un an d'historique, comme les mois. */
const PAST_QUARTERS = 4;

/**
 * Garde-fou sur les années : une date de création saisie de travers (1900) ne doit pas
 * produire un menu de cent lignes.
 */
const MAX_YEARS = 15;

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

/** « Août 2026 ». Les mois **passés** uniquement : le mois en cours a son préréglage. */
export const pastMonths = (today: Date, count = PAST_MONTHS): CalendarPeriod[] =>
  Array.from({ length: count }, (_, index) => {
    const date = subMonths(startOfMonth(today), index + 1);
    return {
      id: `month:${toIsoDate(date)}`,
      label: capitalize(format(date, 'LLLL yyyy', { locale: fr })),
      from: toIsoDate(date),
      to: toIsoDate(endOfMonth(date)),
    };
  });

/** « T2 2026 ». Les trimestres passés, le trimestre en cours ayant son préréglage. */
export const pastQuarters = (today: Date, count = PAST_QUARTERS): CalendarPeriod[] =>
  Array.from({ length: count }, (_, index) => {
    const date = subQuarters(startOfQuarter(today), index + 1);
    return {
      id: `quarter:${toIsoDate(date)}`,
      label: `T${getQuarter(date)} ${format(date, 'yyyy')}`,
      from: toIsoDate(date),
      to: toIsoDate(endOfQuarter(date)),
    };
  });

/**
 * Les années **révolues**, de la plus récente à celle du démarrage de l'activité.
 *
 * `foundedOn` vient de la fiche de la société. Sans elle, on retombe sur trois ans : de
 * quoi couvrir un historique YouTube courant sans inventer une date de création.
 */
export const pastYears = (today: Date, foundedOn: string | null): CalendarPeriod[] => {
  const currentYear = today.getFullYear();
  const firstYear = foundedOn ? new Date(foundedOn).getFullYear() : currentYear - 3;

  const from = Math.max(firstYear, currentYear - MAX_YEARS);
  const years: CalendarPeriod[] = [];

  for (let year = currentYear - 1; year >= from; year -= 1) {
    const date = new Date(year, 0, 1);
    years.push({
      id: `year:${year}`,
      label: String(year),
      from: toIsoDate(startOfYear(date)),
      to: toIsoDate(endOfYear(date)),
    });
  }
  return years;
};
