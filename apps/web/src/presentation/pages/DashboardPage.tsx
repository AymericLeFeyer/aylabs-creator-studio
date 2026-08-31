import { useMemo } from 'react';
import { Clock, Eye, Gift, Heart, Receipt, Users, Video, Wallet } from 'lucide-react';
import { useAnalytics } from '../../application/analytics/usecases/useAnalytics.ts';
import { useChannels } from '../../application/channel/usecases/useChannels.ts';
import { useAnalyticsParams, useFilters } from '../hooks/useFilters.tsx';
import {
  cashRevenue,
  compareTotals,
  moneyValue,
} from '../../domain/analytics/services/revenueMath.ts';
import { NATURE_LABELS } from '../../domain/category/entities/Category.ts';
import { formatHours, formatMoney, formatNumber, formatSigned } from '../../shared/format.ts';
import { StatCard } from '../components/StatCard.tsx';
import { MoneyChart } from '../components/charts/MoneyChart.tsx';
import { AudienceChart } from '../components/charts/AudienceChart.tsx';
import { DonutBreakdown, type DonutSlice } from '../components/charts/DonutBreakdown.tsx';
import { VideoPerformanceChart } from '../components/charts/VideoPerformanceChart.tsx';
import { VideoPerformanceTable } from '../components/charts/VideoPerformanceTable.tsx';
import { EmptyState } from '../components/EmptyState.tsx';

export const DashboardPage = () => {
  const filters = useFilters();
  const params = useAnalyticsParams();
  const { data, isLoading, error } = useAnalytics(params);
  const { data: channels = [], isLoading: channelsLoading } = useChannels();

  const moneyOptions = { mode: filters.moneyMode, includeInKind: filters.includeInKind };

  // L'anneau par chaîne se lit à côté de ceux des catégories : même unité, donc l'argent
  // gagné par chaîne, et non les vues — sinon on comparerait trois échelles différentes.
  const channelSlices = useMemo<DonutSlice[]>(
    () =>
      (data?.byChannel ?? []).map((channel) => ({
        id: channel.channelId,
        label: channel.channelName,
        color: channel.color,
        cents: channel.revenueCashCents + (filters.includeInKind ? channel.inKindCents : 0),
      })),
    [data?.byChannel, filters.includeInKind],
  );

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
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Erreur de chargement des statistiques'}
        </div>
      )}

      {isLoading && !data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-xl border border-border bg-card"
            />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={filters.moneyMode === 'profit' ? 'Bénéfices' : "Chiffre d'affaires"}
              value={formatMoney(moneyValue(data.totals, moneyOptions))}
              change={compareTotals(data.totals, data.previousTotals, (totals) =>
                moneyValue(totals, moneyOptions),
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
            {/* Le gain en gros, le total en petit : sur une période, ce qui se pilote
                c'est la progression — le cumul, lui, ne bouge qu'à la marge. */}
            <StatCard
              label="Abonnés gagnés"
              value={formatSigned(data.totals.subscribersNet)}
              change={compareTotals(data.totals, data.previousTotals, (t) => t.subscribersNet)}
              hint={
                data.totals.subscribersTotal === null
                  ? 'total inconnu'
                  : `${formatNumber(data.totals.subscribersTotal)} au total`
              }
              icon={<Users className="h-4 w-4" />}
              accent={data.totals.subscribersNet < 0 ? 'var(--color-negative)' : undefined}
            />
            <StatCard
              label="Heures vues"
              value={formatHours(data.totals.watchHours)}
              change={compareTotals(data.totals, data.previousTotals, (t) => t.watchHours)}
              icon={<Clock className="h-4 w-4" />}
            />

            <StatCard
              label="Vidéos publiées"
              value={formatNumber(data.totals.videosPublished)}
              change={compareTotals(data.totals, data.previousTotals, (t) => t.videosPublished)}
              hint="sorties sur la période"
              icon={<Video className="h-4 w-4" />}
            />
            <StatCard
              label={NATURE_LABELS.in_kind}
              value={formatNumber(data.totals.inKindEntries)}
              hint={`${formatMoney(data.totals.inKindCents)} valorisés`}
              icon={<Gift className="h-4 w-4" />}
              accent={data.totals.inKindEntries > 0 ? 'var(--in-kind)' : undefined}
            />
            <StatCard
              label="Dépenses"
              value={formatMoney(data.totals.expenseCents)}
              change={compareTotals(data.totals, data.previousTotals, (t) => t.expenseCents)}
              hint="déduites en mode Bénéfices"
              icon={<Receipt className="h-4 w-4" />}
              accent={data.totals.expenseCents > 0 ? 'var(--expense)' : undefined}
            />
            <StatCard
              label="Engagement"
              value={formatNumber(data.totals.likes)}
              change={compareTotals(data.totals, data.previousTotals, (t) => t.likes)}
              hint={`${formatNumber(data.totals.comments)} commentaires`}
              icon={<Heart className="h-4 w-4" />}
            />
          </div>

          {/* Même abscisse, survol synchronisé : côte à côte, une bosse de vues et un
              pic de revenus se lisent d'un seul regard. */}
          <div className="grid gap-4 2xl:grid-cols-2">
            <MoneyChart data={data} />
            <AudienceChart data={data} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <DonutBreakdown
              title="Répartition des revenus"
              slices={data.byCategory.map((item) => ({
                id: `r-${item.categoryId}`,
                label: item.categoryName,
                color: item.color,
                cents: item.totalCents,
                badge: item.nature === 'in_kind' ? NATURE_LABELS.in_kind : undefined,
              }))}
              emptyLabel="Aucun revenu sur cette période."
              totalHint="nature comprise"
            />
            <DonutBreakdown
              title="Répartition des dépenses"
              slices={data.byExpenseCategory.map((item) => ({
                id: `e-${item.categoryId}`,
                label: item.categoryName,
                color: item.color,
                cents: item.totalCents,
              }))}
              emptyLabel="Aucune dépense sur cette période."
            />
            {/* Les revenus globaux (sans chaîne) ne sont dans aucune tranche : le total
                de cet anneau peut être inférieur à celui des revenus, c'est voulu. */}
            <DonutBreakdown
              title="Revenus par chaîne"
              slices={channelSlices}
              emptyLabel="Aucun revenu rattaché à une chaîne sur cette période."
              totalHint="hors revenus globaux"
            />
          </div>

          <div className="grid gap-4 2xl:grid-cols-2">
            <VideoPerformanceChart data={data} />
            <VideoPerformanceTable data={data} />
          </div>
        </>
      )}
    </div>
  );
};
