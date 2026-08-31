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
import { useFilters } from '../../hooks/useFilters.tsx';
import {
  formatBucketLabel,
  formatNumber,
  formatNumberCompact,
  formatSigned,
} from '../../../shared/format.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs.tsx';
import {
  groupVideosByBucket,
  videoMarkerLines,
  type MarkerRow,
  type TooltipVideo,
} from './videoMarkers.tsx';
import { VideoTooltipList } from './VideoTooltipList.tsx';
import { SYNC_ID } from './syncId.ts';

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

interface AudienceRow extends MarkerRow {
  views: number;
  subscribers: number;
  subscribersTotal: number | null;
  watchHours: number;
}

/**
 * Graphique d'audience. Le type de tracé suit la nature de la métrique :
 * un flux se lit en barres, un total cumulé en aire — mélanger les deux
 * laisserait croire qu'on peut additionner des abonnés cumulés entre deux jours.
 *
 * Les repères de sortie de vidéo y sont posés comme sur le graphique d'argent, avec la
 * même coche : une sortie explique souvent un pic de vues autant qu'un pic de revenus.
 */
export const AudienceChart = ({ data }: AudienceChartProps) => {
  const filters = useFilters();
  const [metric, setMetric] = useState<Metric>('views');

  const videosByBucket = useMemo(
    () => groupVideosByBucket(data.videos, filters.showVideos),
    [data.videos, filters.showVideos],
  );

  const rows = useMemo<AudienceRow[]>(
    () =>
      data.series.map((point) => ({
        label: formatBucketLabel(point.date, data.query.granularity),
        bucket: point.date,
        videos: videosByBucket.get(point.date) ?? [],
        views: point.views,
        subscribers: point.subscribersNet,
        subscribersTotal: point.subscribersTotal,
        watchHours: point.watchHours,
      })),
    [data.series, data.query.granularity, videosByBucket],
  );

  /**
   * Domaine calculé ici, en nombres.
   *
   * `subscribersTotal` vaut `null` sur les buckets antérieurs au premier relevé. Passer
   * `['dataMin - 100', 'dataMax + 100']` à Recharts lui fait alors calculer ses bornes
   * sur une série contenant des `null` : le domaine part en `NaN` et **l'aire ne se
   * dessine plus du tout**. On borne donc sur les seules valeurs connues.
   */
  const subscribersDomain = useMemo<[number, number]>(() => {
    const values = rows
      .map((row) => row.subscribersTotal)
      .filter((value): value is number => typeof value === 'number');
    if (values.length === 0) return [0, 1];

    const min = Math.min(...values);
    const max = Math.max(...values);
    // Une courbe plate doit rester au milieu, pas collée à un bord.
    const padding = Math.max(Math.round((max - min) * 0.1), 10);
    return [Math.max(0, min - padding), max + padding];
  }, [rows]);

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
        const videos = (payload[0]?.payload as AudienceRow | undefined)?.videos ?? [];
        return (
          <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
            <p className="text-[11px] text-muted-foreground">{label}</p>
            <p className="text-base font-semibold tabular leading-tight text-popover-foreground">
              {typeof value === 'number' ? formatNumber(value) : '—'}
              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                {METRIC_LABELS[metric]}
              </span>
            </p>
            <VideoTooltipList videos={videos as TooltipVideo[]} />
          </div>
        );
      }}
    />
  );

  // Même `syncId` que le graphique d'argent : les deux abscisses sont identiques,
  // survoler l'une positionne l'autre.
  const chartProps = {
    data: rows,
    syncId: SYNC_ID,
    margin: { top: 8, right: 8, bottom: 0, left: 8 },
  } as const;

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
          <TabsList className="flex-wrap">
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
            <AreaChart {...chartProps}>
              <defs>
                <linearGradient id="subsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-cash)" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="var(--color-cash)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" minTickGap={16} {...axisProps} />
              <YAxis
                width={52}
                domain={subscribersDomain}
                allowDataOverflow={false}
                tickFormatter={formatNumberCompact}
                {...axisProps}
              />
              {tooltip}
              {videoMarkerLines(rows)}
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
            <LineChart {...chartProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" minTickGap={16} {...axisProps} />
              <YAxis width={52} tickFormatter={formatNumberCompact} {...axisProps} />
              {tooltip}
              {videoMarkerLines(rows)}
              <Line
                type="monotone"
                dataKey="subscribers"
                stroke="var(--color-positive)"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          ) : (
            <BarChart {...chartProps}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis dataKey="label" minTickGap={16} {...axisProps} />
              <YAxis width={52} tickFormatter={formatNumberCompact} {...axisProps} />
              {tooltip}
              {videoMarkerLines(rows)}
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
