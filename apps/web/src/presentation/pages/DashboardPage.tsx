import { Clock, Eye, Users, Wallet } from 'lucide-react';
import { useAnalytics } from '../../application/analytics/usecases/useAnalytics.ts';
import { useChannels } from '../../application/channel/usecases/useChannels.ts';
import { useAnalyticsParams, useFilters } from '../hooks/useFilters.tsx';
import {
  cashRevenue,
  compareTotals,
  moneyValue,
} from '../../domain/analytics/services/revenueMath.ts';
import { formatHours, formatMoney, formatNumber, formatSigned } from '../../shared/format.ts';
import { FiltersBar } from '../components/FiltersBar.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { MoneyChart } from '../components/charts/MoneyChart.tsx';
import { AudienceChart } from '../components/charts/AudienceChart.tsx';
import { CategoryBreakdown } from '../components/charts/CategoryBreakdown.tsx';
import { ChannelBreakdown } from '../components/ChannelBreakdown.tsx';
import { EmptyState } from '../components/EmptyState.tsx';

export const DashboardPage = () => {
  const filters = useFilters();
  const params = useAnalyticsParams();
  const { data, isLoading, error } = useAnalytics(params);
  const { data: channels = [], isLoading: channelsLoading } = useChannels();

  if (!channelsLoading && channels.length === 0) {
    return (
      <EmptyState
        title="Aucune chaîne suivie"
        description="Ajoute une première chaîne pour commencer à enregistrer tes statistiques dans le temps."
        actionLabel="Ajouter une chaîne"
        actionTo="/chaines"
      />
    );
  }

  return (
    <div className="space-y-4">
      <FiltersBar />

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Erreur de chargement des statistiques'}
        </div>
      )}

      {isLoading && !data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-xl border border-border bg-card"
            />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={filters.moneyMode === 'profit' ? 'Bénéfices' : "Chiffre d'affaires"}
              value={formatMoney(
                moneyValue(data.totals, {
                  mode: filters.moneyMode,
                  includeInKind: filters.includeInKind,
                }),
              )}
              change={compareTotals(data.totals, data.previousTotals, (totals) =>
                moneyValue(totals, {
                  mode: filters.moneyMode,
                  includeInKind: filters.includeInKind,
                }),
              )}
              hint={`dont ${formatMoney(cashRevenue(data.totals))} encaissés`}
              icon={<Wallet className="h-4 w-4" />}
            />
            <StatCard
              label="Vues"
              value={formatNumber(data.totals.views)}
              change={compareTotals(data.totals, data.previousTotals, (t) => t.views)}
              icon={<Eye className="h-4 w-4" />}
            />
            <StatCard
              label="Abonnés"
              value={
                data.totals.subscribersTotal === null
                  ? '—'
                  : formatNumber(data.totals.subscribersTotal)
              }
              hint={`${formatSigned(data.totals.subscribersNet)} sur la période`}
              icon={<Users className="h-4 w-4" />}
              accent={data.totals.subscribersNet < 0 ? 'var(--color-negative)' : undefined}
            />
            <StatCard
              label="Heures vues"
              value={formatHours(data.totals.watchHours)}
              change={compareTotals(data.totals, data.previousTotals, (t) => t.watchHours)}
              icon={<Clock className="h-4 w-4" />}
            />
          </div>

          <MoneyChart data={data} />
          <AudienceChart data={data} />

          <div className="grid gap-4 lg:grid-cols-2">
            <CategoryBreakdown
              title="Répartition des revenus"
              items={data.byCategory}
              emptyLabel="Aucun revenu sur cette période."
              totalHint="avantages en nature compris"
            />
            <CategoryBreakdown
              title="Répartition des dépenses"
              items={data.byExpenseCategory}
              emptyLabel="Aucune dépense sur cette période."
            />
          </div>

          <ChannelBreakdown data={data} />
        </>
      )}
    </div>
  );
};
