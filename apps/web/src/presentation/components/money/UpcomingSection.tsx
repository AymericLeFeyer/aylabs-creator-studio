import type { ReactNode } from 'react';
import { CalendarClock } from 'lucide-react';
import { UPCOMING_MONTHS } from '../../../domain/expense/services/upcoming.ts';
import { formatMoney } from '../../../shared/format.ts';
import { Card, CardHeader, CardTitle } from '../ui/card.tsx';
import { cn } from '../../../shared/cn.ts';

interface UpcomingSectionProps {
  /** « dépense » ou « revenu » : le libellé change, la mécanique non. */
  kind: 'expense' | 'revenue';
  count: number;
  totalCents: number;
  /** Le premier jour de la fenêtre, pour dire d'où part la projection. */
  from: string;
  to: string;
  children: ReactNode;
}

/**
 * Le bloc « à venir », sous le tableau de la période.
 *
 * Ces lignes existent en base comme les autres — seule leur date les distingue — mais
 * elles sont **hors des cumuls** affichés en haut, qui s'arrêtent à la fin de la période
 * choisie. Les montrer séparément, et non mélangées au tableau, est la seule façon
 * d'avoir les deux informations sans que l'une fausse la lecture de l'autre : un
 * trimestre d'URSSAF déjà daté ne doit pas gonfler les dépenses du mois en cours, mais
 * il ne doit pas non plus arriver par surprise.
 *
 * Le liseré et le fond estompé le disent visuellement : ce n'est pas encore arrivé.
 */
export const UpcomingSection = ({
  kind,
  count,
  totalCents,
  from,
  to,
  children,
}: UpcomingSectionProps) => {
  if (count === 0) return null;

  const accent = kind === 'expense' ? 'var(--expense)' : 'var(--positive)';

  return (
    <Card className="border-dashed">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CalendarClock className="h-4 w-4" />À venir · {count}{' '}
          {kind === 'expense' ? 'dépense(s)' : 'revenu(s)'}
        </CardTitle>
        <div className="text-sm">
          <span className="tabular font-semibold" style={{ color: accent }}>
            {formatMoney(totalCents)}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            d'ici {UPCOMING_MONTHS} mois — hors des totaux ci-dessus
          </span>
        </div>
      </CardHeader>
      <div className={cn('opacity-80')}>{children}</div>
      <p className="px-4 pb-3 text-xs text-muted-foreground">
        Période projetée : du {from} au {to}. Ces lignes sont déjà enregistrées, elles ne sont
        simplement pas encore arrivées.
      </p>
    </Card>
  );
};
