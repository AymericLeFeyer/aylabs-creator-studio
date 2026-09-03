import { useMemo } from 'react';
import { addMonths, addDays } from 'date-fns';
import { useExpenses } from './useExpenses.ts';
import { useRevenues } from '../../revenue/usecases/useRevenues.ts';
import { summarizeUpcoming, UPCOMING_MONTHS } from '../../../domain/expense/services/upcoming.ts';
import { toIsoDate } from '../../../shared/format.ts';

/**
 * La fenêtre du futur : de demain à trois mois.
 *
 * Elle démarre à **demain** et non à aujourd'hui : une dépense datée du jour est déjà
 * comptée dans la période courante du dashboard, et la faire apparaître aussi dans « à
 * venir » la ferait lire deux fois.
 *
 * Elle ne dépend pas de la période choisie en haut d'écran, volontairement : « ce qui
 * arrive » n'est pas une fenêtre qu'on règle, c'est ce que le calendrier impose.
 */
export const useUpcomingRange = () =>
  useMemo(() => {
    const today = new Date();
    return {
      from: toIsoDate(addDays(today, 1)),
      to: toIsoDate(addMonths(today, UPCOMING_MONTHS)),
    };
  }, []);

/**
 * Les dépenses à venir, résumées.
 *
 * Bornées par chaîne comme le reste des écrans : filtrer sur une chaîne doit aussi
 * filtrer ce qui l'attend.
 */
export const useUpcomingExpenses = (channelIds: string[] = []) => {
  const range = useUpcomingRange();
  const query = useExpenses({ from: range.from, to: range.to, channelIds });
  const expenses = useMemo(() => query.data ?? [], [query.data]);

  return {
    ...query,
    range,
    expenses,
    summary: useMemo(() => summarizeUpcoming(expenses), [expenses]),
  };
};

/**
 * Les revenus déjà datés en avant : une sponso encaissable le mois prochain, une
 * facture d'affiliation programmée. Même fenêtre que les dépenses, pour que les deux
 * tableaux du chiffre d'affaires se lisent avec la même règle.
 */
export const useUpcomingRevenues = (channelIds: string[] = []) => {
  const range = useUpcomingRange();
  const query = useRevenues({ from: range.from, to: range.to, channelIds });
  const revenues = useMemo(() => query.data ?? [], [query.data]);

  return {
    ...query,
    range,
    revenues,
    totalCents: useMemo(
      () => revenues.reduce((total, entry) => total + entry.amountCents, 0),
      [revenues],
    ),
  };
};
