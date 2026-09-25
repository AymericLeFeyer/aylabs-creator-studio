import {
  Coins,
  MousePointerClick,
  Percent,
  ShoppingCart,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import {
  useAmazonOverview,
  useIntegrations,
} from '../../application/integration/usecases/useIntegrations.ts';
import type {
  AmazonMonth,
  AmazonOverview,
} from '../../domain/integration/entities/AmazonOverview.ts';
import { formatDate, formatDateTime, formatNumber } from '../../shared/format.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { StatDetails, type DetailRow } from '../components/StatDetails.tsx';
import { AmazonChart } from '../components/amazon/AmazonChart.tsx';
import { Card } from '../components/ui/card.tsx';
import { BlockHeading } from '../dashboard/BlockHeading.tsx';
import {
  AMAZON_METRICS,
  formatMonth,
  formatMonthLong,
  type AmazonMetric,
} from './amazonMetrics.ts';
import { BlockSkeleton } from './BlockSkeleton.tsx';

const ICONS: Record<AmazonMetric['icon'], LucideIcon> = {
  money: Coins,
  click: MousePointerClick,
  cart: ShoppingCart,
  truck: Truck,
  percent: Percent,
  wallet: Wallet,
};

/**
 * Au-delà de trois mois, une barre par jour devient illisible : la semaine prend le relais.
 * La règle ne dépend que des bornes, donc toutes les cartes et le graphique partagent la
 * même requête.
 */
const granularityFor = (from: string, to: string): 'day' | 'week' =>
  (Date.parse(to) - Date.parse(from)) / 86_400_000 > 92 ? 'week' : 'day';

/** Les données de l'écran, bornées par la période de la barre : une requête pour tous. */
const useAmazonData = () => {
  const filters = useFilters();
  const granularity = granularityFor(filters.from, filters.to);
  const query = useAmazonOverview({ from: filters.from, to: filters.to, granularity });
  return { ...query, granularity };
};

const useLastUpdate = () => {
  const { data } = useIntegrations();
  return data?.providers.find((provider) => provider.id === 'amazon')?.lastUpdate ?? null;
};

const percent = (value: number | null): string =>
  value === null ? '—' : `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} %`;

const useFormat = () => {
  const privacy = usePrivacy();
  return (metric: AmazonMetric, value: number | null): string => {
    if (value === null) return '—';
    if (metric.kind === 'money') return privacy.money(value, 'affiliation');
    if (metric.kind === 'percent') return percent(value);
    return formatNumber(value);
  };
};

/** Variation d'un chiffre de la période face à la précédente, de même longueur. */
const changeOf = (current: number | null, previous: number | null): number | null =>
  current === null || previous === null || previous === 0
    ? null
    : ((current - previous) / previous) * 100;

const monthValue = (
  overview: AmazonOverview,
  month: AmazonMonth | null,
  metric: AmazonMetric,
): number | null => {
  if (!month) return null;
  if (metric.field === 'waitingPaymentsCents')
    return overview.current?.waitingPaymentsCents ?? null;
  return month[metric.field];
};

/**
 * Un chiffre Amazon en grand. `month.*` et `waiting` : ce qu'Amazon annonce pour le mois en
 * cours (exact, hors période), avec les mois précédents au survol. `period.*` : la période
 * de la barre, reconstruite, avec sa variation.
 */
export const AmazonMetricCard = ({ metricId }: { metricId: string }) => {
  const { data } = useAmazonData();
  const format = useFormat();
  const privacy = usePrivacy();
  const lastUpdate = useLastUpdate();
  const metric = AMAZON_METRICS.find((candidate) => candidate.id === metricId);
  if (!metric) return null;
  const Icon = ICONS[metric.icon];

  if (metric.scope === 'period') {
    const field = metric.field as Exclude<typeof metric.field, 'waitingPaymentsCents'>;
    const value = data?.totals[field] ?? null;
    const previous = data?.previousTotals[field] ?? null;
    const change = changeOf(value, previous);
    return (
      <StatCard
        label={`Amazon · ${metric.label}`}
        value={format(metric, value)}
        change={metric.kind === 'money' ? privacy.change(change, 'affiliation') : change}
        hint={
          data?.firstSnapshotDate
            ? `mesuré depuis le ${formatDate(data.firstSnapshotDate)}`
            : 'aucun relevé pour l’instant'
        }
        icon={<Icon className="h-4 w-4" />}
        details={
          data ? (
            <StatDetails
              title="Sur la période"
              rows={[
                { key: 'clicks', label: 'Clics', value: format(CLICKS, data.totals.clicks) },
                {
                  key: 'ordered',
                  label: 'Articles commandés',
                  value: format(COUNT, data.totals.itemsOrdered),
                },
                {
                  key: 'conversion',
                  label: 'Conversion',
                  value: percent(data.totals.conversionRate),
                },
                {
                  key: 'earnings',
                  label: 'Gains',
                  value: format(MONEY, data.totals.earningsCents),
                },
                {
                  key: 'previous',
                  label: 'Période précédente',
                  sub: 'même longueur',
                  value: format(metric, previous),
                  muted: true,
                },
              ]}
              note={`Du ${formatDate(data.from)} au ${formatDate(data.to)}. Amazon ne donne que le cumul du mois : chaque jour se lit par différence avec le relevé précédent, et le tout premier relevé ne sert que de point de départ.`}
            />
          ) : undefined
        }
      />
    );
  }

  const current = data?.current ?? null;
  const value = data ? monthValue(data, current, metric) : null;
  const history: DetailRow[] = data
    ? [...data.months]
        .reverse()
        .slice(0, 6)
        .map((month) => ({
          key: month.month,
          label: formatMonthLong(month.month),
          sub:
            month.month === current?.month
              ? `en cours · relevé le ${formatDate(month.date)}`
              : undefined,
          value:
            metric.field === 'waitingPaymentsCents' ? '—' : format(metric, month[metric.field]),
        }))
    : [];

  return (
    <StatCard
      label={`Amazon · ${metric.label}`}
      value={format(metric, value)}
      hint={
        current
          ? `${formatMonthLong(current.month)}${lastUpdate ? ` · relevé le ${formatDateTime(lastUpdate)}` : ''}`
          : 'aucun relevé pour l’instant'
      }
      icon={<Icon className="h-4 w-4" />}
      details={
        metric.field === 'waitingPaymentsCents' ? (
          <StatDetails
            title="Paiements en attente"
            note="Ce qu’Amazon doit verser, tel qu’affiché dans l’historique des paiements. Vide quand aucun paiement n’est en cours."
          />
        ) : (
          <StatDetails
            title={`${metric.label.replace(' du mois', '')} par mois`}
            rows={history}
            empty="Aucun mois relevé."
            note="Chiffres annoncés par Amazon pour chaque mois, à son dernier relevé — indépendants de la période choisie."
          />
        )
      }
    />
  );
};

const MONEY = AMAZON_METRICS.find((metric) => metric.id === 'period.earnings')!;
const CLICKS = AMAZON_METRICS.find((metric) => metric.id === 'period.clicks')!;
const COUNT: AmazonMetric = { ...CLICKS, id: 'count', field: 'itemsOrdered' };

export const AmazonChartBlock = () => {
  const { data, isLoading, granularity } = useAmazonData();
  return (
    <Card className="space-y-2 p-4">
      <BlockHeading
        title="Évolution Amazon"
        description="Gains mois par mois, puis gains, clics et conversion sur la période choisie."
      />
      {isLoading && !data ? (
        <BlockSkeleton className="h-64 border-0" />
      ) : (
        <AmazonChart
          series={data?.series ?? []}
          months={data?.months ?? []}
          granularity={granularity}
        />
      )}
    </Card>
  );
};

/**
 * Le parcours d'un clic jusqu'à la commission, pour le mois en cours : chaque étape est une
 * barre proportionnelle aux clics, avec son taux par rapport à l'étape précédente. C'est ce
 * qui dit où ça coince — beaucoup de clics et peu de commandes n'appellent pas le même
 * geste que des commandes jamais expédiées.
 */
export const AmazonFunnelBlock = () => {
  const { data } = useAmazonData();
  const privacy = usePrivacy();
  const current = data?.current ?? null;

  const steps = current
    ? [
        { key: 'clicks', label: 'Clics', value: current.clicks },
        { key: 'ordered', label: 'Articles commandés', value: current.itemsOrdered },
        { key: 'shipped', label: 'Articles expédiés', value: current.itemsShipped },
        { key: 'returned', label: 'Articles retournés', value: current.itemsReturned },
      ]
    : [];
  const max = Math.max(1, ...steps.map((step) => step.value ?? 0));

  return (
    <Card className="p-4">
      <BlockHeading
        title="Du clic à la commission"
        description={
          current ? `${formatMonthLong(current.month)}, au dernier relevé` : 'Mois en cours'
        }
        className="mb-3"
      />
      {!current ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Aucun relevé pour l’instant.
        </p>
      ) : (
        <div className="space-y-3">
          {steps.map((step, index) => {
            const previous = index === 0 ? null : steps[index - 1]!.value;
            const rate =
              previous && step.value !== null
                ? Math.round((step.value / previous) * 1000) / 10
                : null;
            return (
              <div key={step.key} className="space-y-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">{step.label}</span>
                  <span className="tabular">
                    <span className="font-semibold">
                      {step.value === null ? '—' : formatNumber(step.value)}
                    </span>
                    {rate !== null && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {rate.toLocaleString('fr-FR')} %
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${((step.value ?? 0) / max) * 100}%`,
                      minWidth: step.value ? 4 : 0,
                      backgroundColor:
                        step.key === 'returned' ? 'var(--negative)' : 'var(--primary)',
                    }}
                  />
                </div>
              </div>
            );
          })}
          <div className="flex items-baseline justify-between border-t border-border pt-2 text-sm">
            <span className="text-muted-foreground">
              Commissions sur{' '}
              {current.shippedRevenueCents === null
                ? '—'
                : privacy.money(current.shippedRevenueCents, 'affiliation')}{' '}
              de ventes
            </span>
            <span className="font-semibold tabular">
              {current.earningsCents === null
                ? '—'
                : privacy.money(current.earningsCents, 'affiliation')}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
};

/** Un mois par ligne, du plus récent au plus ancien, tel qu'Amazon l'a annoncé. */
export const AmazonMonthsBlock = () => {
  const { data } = useAmazonData();
  const privacy = usePrivacy();
  const months = [...(data?.months ?? [])].reverse();
  const money = (value: number | null) =>
    value === null ? '—' : privacy.money(value, 'affiliation');

  return (
    <Card className="p-4">
      <BlockHeading title="Mois par mois" description="Hors période choisie" className="mb-3" />
      {months.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Aucun mois relevé pour l’instant.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="pb-2 font-medium">Mois</th>
                <th className="pb-2 text-right font-medium">Clics</th>
                <th className="pb-2 text-right font-medium">Commandés</th>
                <th className="pb-2 text-right font-medium">Conv.</th>
                <th className="pb-2 text-right font-medium">Gains</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {months.map((month) => (
                <tr key={month.month}>
                  <td className="py-1.5">
                    {formatMonth(month.month)}
                    {month.month === data?.current?.month && (
                      <span className="ml-1.5 text-xs text-muted-foreground">en cours</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right tabular">
                    {month.clicks === null ? '—' : formatNumber(month.clicks)}
                  </td>
                  <td className="py-1.5 text-right tabular">
                    {month.itemsOrdered === null ? '—' : formatNumber(month.itemsOrdered)}
                  </td>
                  <td className="py-1.5 text-right tabular">{percent(month.conversionRate)}</td>
                  <td className="py-1.5 text-right font-medium tabular">
                    {money(month.earningsCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
};
