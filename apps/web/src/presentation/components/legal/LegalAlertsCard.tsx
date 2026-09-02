import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarClock, ScrollText } from 'lucide-react';
import type { LegalAlert } from '../../../domain/legal/entities/Legal.ts';
import { formatMonth } from '../../../domain/legal/entities/Legal.ts';
import { formatDate } from '../../../shared/format.ts';
import { Card } from '../ui/card.tsx';
import { cn } from '../../../shared/cn.ts';

/**
 * Les obligations en retard ou à échéance proche, en tête du dashboard.
 *
 * La sévérité vient de l'API, exactement comme les alertes de production : la règle qui
 * décide qu'une déclaration est en retard n'existe qu'à un seul endroit, et cette
 * bannière ne fait que l'afficher. Chaque ligne mène au mois concerné du tableau légal,
 * là où la case se coche.
 */
export const LegalAlertsCard = ({ alerts }: { alerts: LegalAlert[] }) => {
  if (alerts.length === 0) return null;

  return (
    <Card className="divide-y divide-border overflow-hidden">
      <p className="flex items-center gap-2 px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        <ScrollText className="h-3.5 w-3.5" aria-hidden />
        Obligations administratives
      </p>

      {alerts.map((alert) => {
        const danger = alert.severity === 'danger';
        return (
          <Link
            key={`${alert.obligationId}-${alert.month}`}
            to={`/legal?annee=${alert.month.slice(0, 4)}`}
            className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-muted/60"
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                danger
                  ? 'bg-[var(--negative)]/15 text-[var(--negative)]'
                  : 'bg-[var(--expense)]/15 text-[var(--expense)]',
              )}
            >
              {danger ? (
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{alert.label}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {formatMonth(alert.month)} · {danger ? 'échéance dépassée' : 'à faire bientôt'}
              </span>
            </span>
            <span className="shrink-0 text-xs tabular text-muted-foreground">
              {formatDate(alert.dueDate)}
            </span>
          </Link>
        );
      })}
    </Card>
  );
};
