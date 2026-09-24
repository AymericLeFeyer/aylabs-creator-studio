import { useMemo } from 'react';
import { Gift, Receipt, Wallet } from 'lucide-react';
import { useRevenues } from '../../application/revenue/usecases/useRevenues.ts';
import {
  cashRevenue,
  compareTotals,
  grossRevenue,
  moneyValue,
  netProfit,
} from '../../domain/analytics/services/revenueMath.ts';
import { NATURE_LABELS } from '../../domain/category/entities/Category.ts';
import { formatNumber } from '../../shared/format.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { InKindList } from '../components/StatCardLists.tsx';
import { MoneyChart } from '../components/charts/MoneyChart.tsx';
import { useAnalyticsData } from './blockData.ts';
import { BlockSkeleton } from './BlockSkeleton.tsx';

const PENDING = '…';

/** Le chiffre qui suit l'interrupteur CA / Bénéfices de la barre de filtres. */
export const MoneyHeadlineCard = () => {
  const filters = useFilters();
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();
  const options = { mode: filters.moneyMode, includeInKind: filters.includeInKind };
  return (
    <StatCard
      label={filters.moneyMode === 'profit' ? 'Bénéfices' : "Chiffre d'affaires"}
      value={data ? privacy.money(moneyValue(data.totals, options), 'totals') : PENDING}
      change={
        data
          ? privacy.change(
              compareTotals(data.totals, data.previousTotals, (totals) =>
                moneyValue(totals, options),
              ),
              'totals',
            )
          : undefined
      }
      hint={data ? `dont ${privacy.money(cashRevenue(data.totals), 'cash')} encaissés` : undefined}
      icon={<Wallet className="h-4 w-4" />}
    />
  );
};

export const GrossRevenueCard = () => {
  const filters = useFilters();
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();
  return (
    <StatCard
      label="Chiffre d'affaires"
      value={
        data ? privacy.money(grossRevenue(data.totals, filters.includeInKind), 'totals') : PENDING
      }
      change={
        data
          ? privacy.change(
              compareTotals(data.totals, data.previousTotals, (totals) =>
                grossRevenue(totals, filters.includeInKind),
              ),
              'totals',
            )
          : undefined
      }
      hint={data ? `dont ${privacy.money(cashRevenue(data.totals), 'cash')} encaissés` : undefined}
      icon={<Wallet className="h-4 w-4" />}
    />
  );
};

export const ProfitCard = () => {
  const filters = useFilters();
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();
  return (
    <StatCard
      label="Bénéfices"
      value={
        data ? privacy.money(netProfit(data.totals, filters.includeInKind), 'totals') : PENDING
      }
      change={
        data
          ? privacy.change(
              compareTotals(data.totals, data.previousTotals, (totals) =>
                netProfit(totals, filters.includeInKind),
              ),
              'totals',
            )
          : undefined
      }
      hint="CA moins les dépenses"
      icon={<Wallet className="h-4 w-4" />}
    />
  );
};

export const ExpensesCard = () => {
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();
  return (
    <StatCard
      label="Dépenses"
      value={data ? privacy.money(data.totals.expenseCents, 'expenses') : PENDING}
      change={
        data
          ? privacy.change(
              compareTotals(data.totals, data.previousTotals, (t) => t.expenseCents),
              'expenses',
            )
          : undefined
      }
      hint="déduites en mode Bénéfices"
      icon={<Receipt className="h-4 w-4" />}
      accent={data && data.totals.expenseCents > 0 ? 'var(--expense)' : undefined}
    />
  );
};

/**
 * Le **nombre** de produits reçus, avec leur liste au survol. Le détail ne vient pas
 * d'`analytics`, qui n'expose que des agrégats : on relit les revenus bornés exactement
 * comme l'aperçu, sans quoi le panneau contredirait le total juste au-dessus.
 */
export const InKindCountCard = () => {
  const filters = useFilters();
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();
  const { data: revenues = [] } = useRevenues({
    from: filters.from,
    to: filters.to,
    channelIds: filters.channelIds,
  });
  const entries = useMemo(
    () => revenues.filter((entry) => entry.categoryNature === 'in_kind'),
    [revenues],
  );
  return (
    <StatCard
      label={NATURE_LABELS.in_kind}
      value={data ? formatNumber(data.totals.inKindEntries) : PENDING}
      hint={data ? `${privacy.money(data.totals.inKindCents, 'inKind')} valorisés` : undefined}
      icon={<Gift className="h-4 w-4" />}
      accent={data && data.totals.inKindEntries > 0 ? 'var(--in-kind)' : undefined}
      details={<InKindList entries={entries} />}
    />
  );
};

/** La **valeur** des produits reçus sur la période. */
export const InKindValueCard = () => {
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();
  return (
    <StatCard
      label={`${NATURE_LABELS.in_kind} (valeur)`}
      value={data ? privacy.money(data.totals.inKindCents, 'inKind') : PENDING}
      hint={data ? `${data.totals.inKindEntries} produit(s) reçu(s)` : undefined}
      icon={<Gift className="h-4 w-4" />}
      accent={data && data.totals.inKindCents > 0 ? 'var(--in-kind)' : undefined}
    />
  );
};

export const MoneyChartBlock = () => {
  const { data } = useAnalyticsData();
  return data ? <MoneyChart data={data} /> : <BlockSkeleton />;
};
