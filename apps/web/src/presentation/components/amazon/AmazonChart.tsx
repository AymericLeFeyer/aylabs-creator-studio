import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AmazonMonth,
  AmazonSeriesPoint,
} from '../../../domain/integration/entities/AmazonOverview.ts';
import { formatBucketLabel, formatMoney, formatNumber } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { formatMonth } from '../../blocks/amazonMetrics.ts';

type Granularity = 'day' | 'week' | 'month';
type Tab = 'months' | 'earnings' | 'clicks' | 'conversion';

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'months', label: 'Par mois', hint: 'Gains annoncés par Amazon, mois par mois' },
  { id: 'earnings', label: 'Gains', hint: 'Gains sur la période choisie' },
  { id: 'clicks', label: 'Clics', hint: 'Clics sur tes liens, sur la période choisie' },
  {
    id: 'conversion',
    label: 'Conversion',
    hint: 'Articles commandés pour 100 clics, sur la période choisie',
  },
];

/**
 * Les quatre lectures de l'historique Amazon, en onglets plutôt qu'en double axe : des
 * euros, des clics et un pourcentage n'ont pas la même échelle.
 *
 * - **Par mois** : le total qu'Amazon annonce lui-même (dernier relevé de chaque mois) —
 *   **hors période**, c'est la seule lecture qui remonte avant la période choisie.
 * - **Gains**, **Clics** : des FLUX par bucket, reconstruits par différence de relevés.
 * - **Conversion** : recalculée par bucket (`commandés / clics`), jamais moyennée.
 */
export const AmazonChart = ({
  series,
  months,
  granularity,
}: {
  series: AmazonSeriesPoint[];
  months: AmazonMonth[];
  granularity: Granularity;
}) => {
  const [tab, setTab] = useState<Tab>('months');
  const privacy = usePrivacy();
  const masked = privacy.isMasked('affiliation');

  const rows = useMemo(() => {
    if (tab === 'months') {
      return months.slice(-12).map((month) => ({
        date: month.month,
        value: month.earningsCents === null ? null : masked ? 0 : month.earningsCents / 100,
      }));
    }
    return series.map((point) => ({
      date: point.date,
      value:
        tab === 'earnings'
          ? point.earningsCents === null
            ? null
            : masked
              ? 0
              : point.earningsCents / 100
          : tab === 'clicks'
            ? point.clicks
            : point.clicks
              ? Math.round(((point.itemsOrdered ?? 0) / point.clicks) * 1000) / 10
              : null,
    }));
  }, [tab, series, months, masked]);

  const label = (date: string) =>
    tab === 'months' ? formatMonth(date) : formatBucketLabel(date, granularity);
  const format = (value: number): string =>
    tab === 'months' || tab === 'earnings'
      ? privacy.money(Math.round(value * 100), 'affiliation')
      : tab === 'clicks'
        ? `${formatNumber(value)} clic(s)`
        : `${value.toLocaleString('fr-FR')} %`;
  const empty = rows.every((row) => row.value === null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center rounded-md border border-border p-0.5">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              title={entry.hint}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                tab === entry.id
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {TABS.find((entry) => entry.id === tab)?.hint}
        </p>
      </div>

      {empty ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {tab === 'months'
            ? 'Aucun relevé pour l’instant.'
            : 'Il faut deux relevés pour mesurer une période : le premier sert de point de départ.'}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          {tab === 'conversion' ? (
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={label}
                tick={{ fontSize: 11 }}
                stroke="var(--muted-foreground)"
                minTickGap={24}
              />
              <YAxis
                tickFormatter={(value: number) => `${value} %`}
                tick={{ fontSize: 11 }}
                stroke="var(--muted-foreground)"
                width={48}
              />
              <Tooltip content={<ChartTooltip formatLabel={label} format={format} />} />
              <Line
                type="monotone"
                dataKey="value"
                stroke="var(--primary)"
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          ) : (
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={label}
                tick={{ fontSize: 11 }}
                stroke="var(--muted-foreground)"
                minTickGap={tab === 'months' ? 4 : 24}
              />
              <YAxis
                allowDecimals={tab !== 'clicks'}
                tickFormatter={(value: number) =>
                  tab === 'clicks' ? formatNumber(value) : formatMoney(value * 100)
                }
                tick={{ fontSize: 11 }}
                stroke="var(--muted-foreground)"
                width={tab === 'clicks' ? 40 : 64}
              />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                content={<ChartTooltip formatLabel={label} format={format} />}
              />
              <Bar
                dataKey="value"
                radius={[3, 3, 0, 0]}
                fill={tab === 'clicks' ? 'var(--primary)' : 'var(--cash)'}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
};

/** Recharts y injecte `active`, `payload` et `label` (l'abscisse survolée). */
const ChartTooltip = ({
  active,
  payload,
  label,
  formatLabel,
  format,
}: {
  active?: boolean;
  payload?: Array<{ value?: unknown }>;
  label?: unknown;
  formatLabel: (date: string) => string;
  format: (value: number) => string;
}) => {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1 text-[11px] text-muted-foreground">{formatLabel(String(label))}</p>
      <p className="font-semibold tabular text-popover-foreground">
        {typeof value !== 'number' ? '—' : format(value)}
      </p>
    </div>
  );
};
