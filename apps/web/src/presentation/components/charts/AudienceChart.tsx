import { useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
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
import type { AnalyticsResult } from '../../../domain/analytics/entities/Analytics.ts';
import {
  formatBucketLabel,
  formatNumber,
  formatNumberCompact,
  formatSigned,
} from '../../../shared/format.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs.tsx';

type Metric = 'views' | 'subscribers' | 'subscribersTotal' | 'watchHours';

const METRIC_LABELS: Record<Metric, string> = {
  views: 'Vues',
  subscribers: 'Abonnés gagnés',
  subscribersTotal: 'Abonnés cumulés',
  watchHours: 'Heures vues',
};

interface AudienceChartProps {
  data: AnalyticsResult;
}

/**
 * Graphique d'audience. Le type de tracé suit la nature de la métrique :
 * un flux se lit en barres, un total cumulé en aire — mélanger les deux
 * laisserait croire qu'on peut additionner des abonnés cumulés entre deux jours.
 */
export const AudienceChart = ({ data }: AudienceChartProps) => {
  const [metric, setMetric] = useState<Metric>('views');

  const rows = useMemo(
    () =>
      data.series.map((point) => ({
        label: formatBucketLabel(point.date, data.query.granularity),
        views: point.views,
        subscribers: point.subscribersNet,
        subscribersTotal: point.subscribersTotal,
        watchHours: point.watchHours,
      })),
    [data.series, data.query.granularity],
  );

  const axisProps = {
    tick: { fontSize: 11, fill: 'var(--color-muted-foreground)' },
    tickLine: false,
    axisLine: false,
  } as const;

  const total =
    metric === 'subscribersTotal'
      ? data.totals.subscribersTotal
      : metric === 'views'
        ? data.totals.views
        : metric === 'subscribers'
          ? data.totals.subscribersNet
          : data.totals.watchHours;

  const tooltip = (
    <Tooltip
      content={({ active, payload, label }) => {
        if (!active || !payload?.length) return null;
        const value = payload[0]?.value;
        return (
          <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
            <p className="font-medium text-popover-foreground">{label}</p>
            <p className="tabular text-muted-foreground">
              {METRIC_LABELS[metric]} :{' '}
              <span className="text-popover-foreground">
                {typeof value === 'number' ? formatNumber(value) : '—'}
              </span>
            </p>
          </div>
        );
      }}
    />
  );

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle>Audience</CardTitle>
          <p className="mt-1 text-2xl font-semibold tabular">
            {total === null
              ? '—'
              : metric === 'subscribers'
                ? formatSigned(total)
                : formatNumber(total)}
          </p>
        </div>

        <Tabs value={metric} onValueChange={(value) => setMetric(value as Metric)}>
          <TabsList>
            {(Object.keys(METRIC_LABELS) as Metric[]).map((key) => (
              <TabsTrigger key={key} value={key} className="text-xs">
                {METRIC_LABELS[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent>
        <ResponsiveContainer width="100%" height={280}>
          {metric === 'subscribersTotal' ? (
            <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="subsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-cash)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--color-cash)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" minTickGap={16} {...axisProps} />
              <YAxis
                width={56}
                domain={['dataMin - 100', 'dataMax + 100']}
                tickFormatter={formatNumberCompact}
                {...axisProps}
              />
              {tooltip}
              <Area
                type="monotone"
                dataKey="subscribersTotal"
                stroke="var(--color-cash)"
                strokeWidth={2}
                fill="url(#subsGradient)"
                connectNulls
              />
            </AreaChart>
          ) : metric === 'subscribers' ? (
            <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" minTickGap={16} {...axisProps} />
              <YAxis width={56} tickFormatter={formatNumberCompact} {...axisProps} />
              {tooltip}
              <Line
                type="monotone"
                dataKey="subscribers"
                stroke="var(--color-positive)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          ) : (
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" minTickGap={16} {...axisProps} />
              <YAxis width={56} tickFormatter={formatNumberCompact} {...axisProps} />
              {tooltip}
              <Bar
                dataKey={metric}
                fill="var(--color-cash)"
                radius={[3, 3, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
