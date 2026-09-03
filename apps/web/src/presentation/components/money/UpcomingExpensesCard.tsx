import { CalendarClock } from 'lucide-react';
import { useUpcomingExpenses } from '../../../application/expense/usecases/useUpcoming.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import { UPCOMING_MONTHS } from '../../../domain/expense/services/upcoming.ts';
import { formatDate, formatMoney } from '../../../shared/format.ts';
import { StatCard } from '../StatCard.tsx';

/**
 * La carte « Dépenses à venir ».
 *
 * Le seul chiffre du tableau de bord qui regarde **devant** : tout le reste raconte une
 * période écoulée. C'est volontaire — un trimestre d'URSSAF déjà daté ne change rien au
 * bénéfice du mois passé, mais il change tout à ce qu'on peut en sortir. La baseline dit
 * la part fiscale, parce que c'est la ligne qui surprend et qui ne se négocie pas.
 *
 * Elle ne suit pas la période choisie en haut d'écran : « ce qui arrive » n'est pas une
 * fenêtre qu'on règle, c'est ce que le calendrier impose. Le sous-titre le dit.
 */
export const UpcomingExpensesCard = () => {
  const filters = useFilters();
  const { summary } = useUpcomingExpenses(filters.channelIds);

  return (
    <StatCard
      label="Dépenses à venir"
      value={formatMoney(summary.totalCents)}
      hint={
        summary.taxCents > 0
          ? `dont ${formatMoney(summary.taxCents)} d'impôts`
          : `sur ${UPCOMING_MONTHS} mois, hors période`
      }
      icon={<CalendarClock className="h-4 w-4" />}
      accent={summary.totalCents > 0 ? 'var(--expense)' : undefined}
      details={
        summary.count === 0 ? (
          <p className="text-muted-foreground">
            Rien de daté dans les {UPCOMING_MONTHS} prochains mois.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="font-medium">
              {summary.count} échéance(s) d'ici {UPCOMING_MONTHS} mois
              {summary.nextDate && ` — la première le ${formatDate(summary.nextDate)}`}
            </p>
            <ul className="space-y-1">
              {summary.byCategory.map((row) => (
                <li key={row.categoryId} className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: row.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="shrink-0 tabular">{formatMoney(row.totalCents)}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground">
              Ces montants ne sont pas comptés dans les totaux de la période : ils ne sont pas
              encore arrivés.
            </p>
          </div>
        )
      }
    />
  );
};
