import { useMemo, useState } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { AnalyticsResult } from '../../../domain/analytics/entities/Analytics.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import {
  formatDate,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatNumberCompact,
  formatSigned,
} from '../../../shared/format.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Tabs, TabsList, TabsTrigger } from '../ui/tabs.tsx';
import { sumVideoRows, withMoney, type VideoRow } from './videoPerformance.ts';

type Metric = 'views' | 'subscribersGained' | 'money';

const METRIC_LABELS: Record<Metric, string> = {
  views: 'Vues',
  subscribersGained: 'Abonnés gagnés',
  money: 'Argent gagné',
};

/** Au-delà, les barres deviennent illisibles : le tableau à côté garde tout. */
const MAX_BARS = 12;

interface VideoPerformanceChartProps {
  data: AnalyticsResult;
}

/**
 * Classement des vidéos sorties pendant la période, une métrique à la fois.
 *
 * Onglets plutôt que double axe : vues, abonnés et euros n'ont pas la même échelle,
 * et un second axe ferait lire des corrélations inventées.
 *
 * Les compteurs sont des CUMULS depuis la sortie, relevés par la collecte. Ils ne
 * s'additionnent pas avec les totaux de la période, qui comptent aussi ce que
 * rapportent les vidéos plus anciennes.
 */
export const VideoPerformanceChart = ({ data }: VideoPerformanceChartProps) => {
  const { moneyMode, includeInKind } = useFilters();
  const [metric, setMetric] = useState<Metric>('views');

  const rows = useMemo(
    () => withMoney(data.videoPerformance, { mode: moneyMode, includeInKind }),
    [data.videoPerformance, moneyMode, includeInKind],
  );

  const value = (row: VideoRow): number =>
    metric === 'money' ? row.moneyCents / 100 : row[metric];

  const bars = useMemo(
    () => [...rows].sort((a, b) => value(b) - value(a)).slice(0, MAX_BARS),
    // `value` dépend de `metric` : le tri se refait au changement d'onglet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, metric],
  );

  const totals = useMemo(() => sumVideoRows(rows), [rows]);
  const anyStats = rows.some((row) => row.hasStats);

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Classement des vidéos</CardTitle>
          <p className="mt-1 text-2xl font-semibold tabular">
            {metric === 'money'
              ? formatMoney(totals.moneyCents)
              : metric === 'subscribersGained'
                ? formatSigned(totals.subscribersGained)
                : formatNumber(totals.views)}
          </p>
          <p className="text-xs text-muted-foreground">
            {rows.length} sortie{rows.length > 1 ? 's' : ''} sur la période
            {metric !== 'money' && ' · cumul depuis chaque sortie'}
          </p>
        </div>

        <Tabs value={metric} onValueChange={(next) => setMetric(next as Metric)}>
          <TabsList className="h-auto flex-wrap">
            {(Object.keys(METRIC_LABELS) as Metric[]).map((key) => (
              <TabsTrigger key={key} value={key} className="text-xs">
                {METRIC_LABELS[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        {rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Aucune sortie sur cette période. Les vidéos et leurs compteurs sont enregistrés à chaque
            collecte.
          </p>
        ) : (
          <>
            {!anyStats && metric !== 'money' && (
              <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                Aucun compteur par vidéo n'a encore été relevé. Lance une collecte : les vues et les
                abonnés par vidéo arrivent avec elle.
              </p>
            )}

            {/* Barres horizontales : les titres se lisent à gauche, là où un axe
                vertical les couperait ou les ferait pivoter. */}
            <ResponsiveContainer width="100%" height={Math.max(160, bars.length * 30 + 24)}>
              <BarChart
                data={bars}
                layout="vertical"
                margin={{ top: 4, right: 12, bottom: 4, left: 4 }}
              >
                <XAxis
                  type="number"
                  tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) =>
                    metric === 'money' ? formatMoneyCompact(v * 100) : formatNumberCompact(v)
                  }
                />
                <YAxis
                  type="category"
                  dataKey="title"
                  width={150}
                  tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(title: string) =>
                    title.length > 24 ? `${title.slice(0, 23)}…` : title
                  }
                />
                <Tooltip
                  cursor={{ fill: 'var(--color-muted)', fillOpacity: 0.4 }}
                  content={<VideoTooltip metric={metric} />}
                />
                <Bar dataKey={value} radius={[0, 3, 3, 0]} maxBarSize={18}>
                  {bars.map((row) => (
                    <Cell key={row.videoId} fill={row.channelColor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {rows.length > MAX_BARS && (
              <p className="text-xs text-muted-foreground">
                {MAX_BARS} premières vidéos affichées ; le tableau les liste toutes.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

const VideoTooltip = ({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ payload?: VideoRow }>;
  metric: Metric;
}) => {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;

  return (
    <div className="max-w-xs rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="line-clamp-2 font-medium text-popover-foreground">{row.title}</p>
      <p className="mb-1.5 text-[11px] text-muted-foreground">
        {row.channelName} · {formatDate(row.date)}
      </p>
      <p className="text-base font-semibold tabular leading-tight text-popover-foreground">
        {metric === 'money'
          ? formatMoney(row.moneyCents)
          : !row.hasStats
            ? '—'
            : metric === 'views'
              ? formatNumber(row.views)
              : formatSigned(row.subscribersGained)}
        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
          {METRIC_LABELS[metric]}
        </span>
      </p>
      {metric === 'money' && (
        <div className="mt-1 space-y-0.5 border-t border-border pt-1.5 text-muted-foreground">
          <MoneyLine label="AdSense" value={row.adsenseCents} />
          <MoneyLine label="Revenus liés" value={row.manualCashCents} />
          <MoneyLine label="En nature" value={row.inKindCents} />
          <MoneyLine label="Dépenses liées" value={-row.expenseCents} />
        </div>
      )}
    </div>
  );
};

const MoneyLine = ({ label, value }: { label: string; value: number }) =>
  value === 0 ? null : (
    <div className="flex items-center justify-between gap-4">
      <span>{label}</span>
      <span className="tabular text-popover-foreground">{formatMoney(value)}</span>
    </div>
  );
