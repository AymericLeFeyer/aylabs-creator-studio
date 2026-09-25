import { useMemo } from 'react';
import { Gift, Receipt, Wallet } from 'lucide-react';
import { useRevenues } from '../../application/revenue/usecases/useRevenues.ts';
import type { AnalyticsResult } from '../../domain/analytics/entities/Analytics.ts';
import {
  cashRevenue,
  compareTotals,
  grossRevenue,
  moneyValue,
  netProfit,
} from '../../domain/analytics/services/revenueMath.ts';
import { NATURE_LABELS } from '../../domain/category/entities/Category.ts';
import { revenueMaskKey } from '../../domain/privacy/services/privacy.ts';
import { formatDate, formatNumber } from '../../shared/format.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { InKindList } from '../components/StatCardLists.tsx';
import { StatDetails, type DetailRow } from '../components/StatDetails.tsx';
import { MoneyChart } from '../components/charts/MoneyChart.tsx';
import { useAnalyticsData } from './blockData.ts';
import { BlockSkeleton } from './BlockSkeleton.tsx';

const PENDING = '…';

type Privacy = ReturnType<typeof usePrivacy>;

/** Les revenus de la période, catégorie par catégorie — AdSense compris. */
const revenueRows = (data: AnalyticsResult, privacy: Privacy, includeInKind: boolean) =>
  data.byCategory
    .filter((row) => row.totalCents !== 0)
    .map((row): DetailRow => ({
      key: `r:${row.categoryId}`,
      label: row.categoryName,
      color: row.color,
      operator: '+',
      value: privacy.money(row.totalCents, revenueMaskKey(row.categoryId, row.nature)),
      muted: row.nature === 'in_kind' && !includeInKind,
      sub: row.nature === 'in_kind' && !includeInKind ? 'non compté (case décochée)' : undefined,
    }));

/** Les dépenses de la période, catégorie par catégorie. */
const expenseRows = (data: AnalyticsResult, privacy: Privacy, operator?: '−') =>
  data.byExpenseCategory
    .filter((row) => row.totalCents !== 0)
    .map((row): DetailRow => ({
      key: `e:${row.categoryId}`,
      label: row.categoryName,
      color: row.color,
      operator,
      value: privacy.money(row.totalCents, 'expenses'),
    }));

const periodNote = (data: AnalyticsResult, previous: string | null) =>
  `Du ${formatDate(data.query.from)} au ${formatDate(data.query.to)}${
    previous ? ` · période précédente : ${previous}` : ''
  }.`;

/**
 * Le calcul complet, de la première catégorie de revenu au bénéfice : le même
 * `revenueMath` que la carte, déroulé ligne à ligne pour qu'il se vérifie à l'œil.
 */
const MoneyDetails = ({
  data,
  mode,
  includeInKind,
}: {
  data: AnalyticsResult;
  mode: 'revenue' | 'profit';
  includeInKind: boolean;
}) => {
  const privacy = usePrivacy();
  const gross = grossRevenue(data.totals, includeInKind);
  const rows: DetailRow[] =
    mode === 'revenue'
      ? [
          ...revenueRows(data, privacy, includeInKind),
          {
            key: 'gross',
            operator: '=',
            label: "Chiffre d'affaires",
            value: privacy.money(gross, 'totals'),
          },
        ]
      : [
          {
            key: 'gross',
            label: "Chiffre d'affaires",
            sub: `dont ${privacy.money(cashRevenue(data.totals), 'cash')} encaissés`,
            value: privacy.money(gross, 'totals'),
          },
          ...expenseRows(data, privacy, '−'),
          {
            key: 'profit',
            operator: '=',
            label: 'Bénéfices',
            value: privacy.money(netProfit(data.totals, includeInKind), 'totals'),
          },
        ];
  const previous = data.previousTotals
    ? privacy.money(
        mode === 'profit'
          ? netProfit(data.previousTotals, includeInKind)
          : grossRevenue(data.previousTotals, includeInKind),
        'totals',
      )
    : null;
  return (
    <StatDetails
      title={mode === 'profit' ? 'CA moins les dépenses' : 'Revenus de la période, par catégorie'}
      rows={rows}
      max={12}
      empty="Aucun mouvement sur la période."
      note={
        <>
          {periodNote(data, previous)} Encaissé : AdSense{' '}
          {privacy.money(data.totals.adsenseCents, 'adsense')} + revenus saisis{' '}
          {privacy.money(data.totals.manualCashCents, 'manualCash')}.{' '}
          {includeInKind
            ? `${NATURE_LABELS.in_kind} comptés à leur valeur, jamais encaissés.`
            : `${NATURE_LABELS.in_kind} exclus (case décochée dans les filtres).`}
        </>
      }
    />
  );
};

/** Les revenus en nature de la période, bornés exactement comme l'aperçu. */
const useInKindEntries = () => {
  const filters = useFilters();
  const { data: revenues = [] } = useRevenues({
    from: filters.from,
    to: filters.to,
    channelIds: filters.channelIds,
  });
  return useMemo(() => revenues.filter((entry) => entry.categoryNature === 'in_kind'), [revenues]);
};

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
      details={
        data ? (
          <MoneyDetails
            data={data}
            mode={filters.moneyMode}
            includeInKind={filters.includeInKind}
          />
        ) : undefined
      }
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
      details={
        data ? (
          <MoneyDetails data={data} mode="revenue" includeInKind={filters.includeInKind} />
        ) : undefined
      }
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
      details={
        data ? (
          <MoneyDetails data={data} mode="profit" includeInKind={filters.includeInKind} />
        ) : undefined
      }
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
      details={
        data ? (
          <StatDetails
            title="Dépenses de la période, par catégorie"
            rows={expenseRows(data, privacy)}
            max={10}
            total={{ label: 'Total', value: privacy.money(data.totals.expenseCents, 'expenses') }}
            empty="Aucune dépense sur la période."
            note={periodNote(
              data,
              data.previousTotals
                ? privacy.money(data.previousTotals.expenseCents, 'expenses')
                : null,
            )}
          />
        ) : undefined
      }
    />
  );
};

/**
 * Le **nombre** de produits reçus, avec leur liste au survol. Le détail ne vient pas
 * d'`analytics`, qui n'expose que des agrégats : on relit les revenus bornés exactement
 * comme l'aperçu, sans quoi le panneau contredirait le total juste au-dessus.
 */
export const InKindCountCard = () => {
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();
  const entries = useInKindEntries();
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
  const entries = useInKindEntries();
  return (
    <StatCard
      label={`${NATURE_LABELS.in_kind} (valeur)`}
      value={data ? privacy.money(data.totals.inKindCents, 'inKind') : PENDING}
      hint={data ? `${data.totals.inKindEntries} produit(s) reçu(s)` : undefined}
      icon={<Gift className="h-4 w-4" />}
      accent={data && data.totals.inKindCents > 0 ? 'var(--in-kind)' : undefined}
      details={<InKindList entries={entries} />}
    />
  );
};

export const MoneyChartBlock = () => {
  const { data } = useAnalyticsData();
  return data ? <MoneyChart data={data} /> : <BlockSkeleton />;
};
