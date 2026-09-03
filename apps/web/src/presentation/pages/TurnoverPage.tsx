import { useSearchParams } from 'react-router-dom';
import { Receipt, Wallet } from 'lucide-react';
import { useAnalytics } from '../../application/analytics/usecases/useAnalytics.ts';
import { useBrandStats } from '../../application/brand/usecases/useBrands.ts';
import { useAnalyticsParams, useFilters } from '../hooks/useFilters.tsx';
import {
  cashRevenue,
  compareTotals,
  grossRevenue,
  netProfit,
} from '../../domain/analytics/services/revenueMath.ts';
import { NATURE_LABELS } from '../../domain/category/entities/Category.ts';
import { formatMoney } from '../../shared/format.ts';
import { StatCard } from '../components/StatCard.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { MoneyChart } from '../components/charts/MoneyChart.tsx';
import { MoneyBreakdowns } from '../components/money/MoneyBreakdowns.tsx';
import { RevenuesPanel } from '../components/money/RevenuesPanel.tsx';
import { ExpensesPanel } from '../components/money/ExpensesPanel.tsx';
import { UpcomingExpensesCard } from '../components/money/UpcomingExpensesCard.tsx';

const TABS = ['synthese', 'revenus', 'depenses'] as const;
type TurnoverTab = (typeof TABS)[number];

/**
 * Le chiffre d'affaires en un seul écran : la synthèse, puis les deux grands livres.
 *
 * Revenus et dépenses étaient deux entrées de navigation distinctes ; ils décrivent
 * pourtant les deux moitiés de la même soustraction et se consultent l'un après
 * l'autre. Les réunir sous un onglet met le bénéfice à portée de regard des lignes qui
 * le composent. Les anciennes adresses `/revenus` et `/depenses` redirigent ici, sur
 * le bon onglet.
 */
export const TurnoverPage = () => {
  const filters = useFilters();
  const params = useAnalyticsParams();
  const { data, isLoading } = useAnalytics(params);

  const { data: brandStats = [] } = useBrandStats({
    from: filters.from,
    to: filters.to,
    channelIds: filters.channelIds,
  });

  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('onglet');
  const tab: TurnoverTab = TABS.includes(requested as TurnoverTab)
    ? (requested as TurnoverTab)
    : 'synthese';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Chiffre d'affaires</h1>
        <p className="text-sm text-muted-foreground">
          Ce qui rentre, ce qui sort, et la soustraction des deux — sur la période choisie en haut.
        </p>
      </div>

      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Chiffre d'affaires"
            value={formatMoney(grossRevenue(data.totals, filters.includeInKind))}
            change={compareTotals(data.totals, data.previousTotals, (totals) =>
              grossRevenue(totals, filters.includeInKind),
            )}
            hint={`dont ${formatMoney(cashRevenue(data.totals))} encaissés`}
            icon={<Wallet className="h-4 w-4" />}
          />
          <StatCard
            label="Bénéfices"
            value={formatMoney(netProfit(data.totals, filters.includeInKind))}
            change={compareTotals(data.totals, data.previousTotals, (totals) =>
              netProfit(totals, filters.includeInKind),
            )}
            hint="CA moins les dépenses"
            icon={<Wallet className="h-4 w-4" />}
          />
          <StatCard
            label="Dépenses"
            value={formatMoney(data.totals.expenseCents)}
            change={compareTotals(data.totals, data.previousTotals, (t) => t.expenseCents)}
            icon={<Receipt className="h-4 w-4" />}
            accent={data.totals.expenseCents > 0 ? 'var(--expense)' : undefined}
          />
          <StatCard
            label={NATURE_LABELS.in_kind}
            value={formatMoney(data.totals.inKindCents)}
            hint={`${data.totals.inKindEntries} produit(s) reçu(s)`}
            icon={<Wallet className="h-4 w-4" />}
            accent={data.totals.inKindCents > 0 ? 'var(--in-kind)' : undefined}
          />
          {/* Ce qui est engagé mais pas encore passé. Hors des quatre chiffres
              précédents, qui s'arrêtent à la fin de la période. */}
          <UpcomingExpensesCard />
        </div>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ onglet: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="synthese">Synthèse</TabsTrigger>
          <TabsTrigger value="revenus">Revenus</TabsTrigger>
          <TabsTrigger value="depenses">Dépenses</TabsTrigger>
        </TabsList>

        <TabsContent value="synthese" className="space-y-4">
          {isLoading && !data && (
            <div className="h-80 animate-pulse rounded-xl border border-border bg-card" />
          )}
          {data && (
            <>
              {/* Le même graphique que le dashboard, mais entouré ici de tout son
                  détail : c'est la page où l'on vient comprendre une barre. */}
              <MoneyChart data={data} />
              <MoneyBreakdowns data={data} brandStats={brandStats} />
            </>
          )}
        </TabsContent>

        <TabsContent value="revenus">
          <RevenuesPanel />
        </TabsContent>

        <TabsContent value="depenses">
          <ExpensesPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
};
