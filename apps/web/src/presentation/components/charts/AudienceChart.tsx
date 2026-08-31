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
  AnalyticsResult,
  AnalyticsTotals,
} from '../../../domain/analytics/entities/Analytics.ts';
import { compareTotals } from '../../../domain/analytics/services/revenueMath.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import {
  formatBucketLabel,
  formatNumber,
  formatNumberCompact,
  formatPercent,
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

/**
 * Uniquement des FLUX.
 *
 * Le cumul d'abonnés a été retiré : il vaut `null` sur tous les buckets antérieurs au
 * premier relevé de la chaîne, et une courbe pleine de trous n'apprend rien de plus que
 * la carte « Abonnés gagnés », qui affiche déjà le total en sous-titre.
 */
type Metric = 'views' | 'subscribers' | 'watchHours';

const METRIC_LABELS: Record<Metric, string> = {
  views: 'Vues',
  subscribers: 'Abonnés gagnés',
  watchHours: 'Heures vues',
};

interface AudienceChartProps {
  data: AnalyticsResult;
}

interface AudienceRow extends MarkerRow {
  views: number;
  subscribers: number;
  watchHours: number;
}

/**
 * Graphique d'audience. Le type de tracé suit la nature de la métrique : un volume se
 * lit en barres, un solde qui peut passer sous zéro en ligne.
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
        watchHours: point.watchHours,
      })),
    [data.series, data.query.granularity, videosByBucket],
  );

  /** Ce que la métrique courante va chercher dans les cumuls, période précédente comprise. */
  const pick = (totals: AnalyticsTotals): number =>
    metric === 'views'
      ? totals.views
      : metric === 'subscribers'
        ? totals.subscribersNet
        : totals.watchHours;

  const total = pick(data.totals);
  const change = compareTotals(data.totals, data.previousTotals, pick);

  const axisProps = {
    tick: { fontSize: 11, fill: 'var(--color-muted-foreground)' },
    tickLine: false,
    axisLine: false,
  } as const;

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
            {metric === 'subscribers' ? formatSigned(total) : formatNumber(total)}
          </p>
          {/* Toujours rendue, même sans point de comparaison : c'est cette troisième
              ligne qui donne à l'en-tête la hauteur de celui du graphique d'argent,
              pour que les deux tracés démarrent au même niveau côte à côte. */}
          <p className="text-xs text-muted-foreground">
            {change === null
              ? 'pas de période de comparaison'
              : `${formatPercent(change)} vs période précédente`}
          </p>
        </div>

        <Tabs value={metric} onValueChange={(value) => setMetric(value as Metric)}>
          <TabsList className="h-auto flex-wrap">
            {(Object.keys(METRIC_LABELS) as Metric[]).map((key) => (
              <TabsTrigger key={key} value={key} className="text-xs">
                {METRIC_LABELS[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          {metric === 'subscribers' ? (
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
