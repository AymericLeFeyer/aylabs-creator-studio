import { useMemo } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AnalyticsResult,
  CategoryBreakdownItem,
  VideoMarker,
} from '../../../domain/analytics/entities/Analytics.ts';
import { cashRevenue, moneyValue } from '../../../domain/analytics/services/revenueMath.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import { formatBucketLabel, formatMoney, formatMoneyCompact } from '../../../shared/format.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Label } from '../ui/label.tsx';
import { Switch } from '../ui/switch.tsx';
import { Checkbox } from '../ui/checkbox.tsx';

interface MoneyChartProps {
  data: AnalyticsResult;
}

/**
 * Une barre du graphique. La clé est plate (`r0`, `e1`…) plutôt que l'identifiant de
 * catégorie : Recharts résout un `dataKey` texte comme un chemin, un identifiant
 * contenant un point casserait la lecture.
 */
interface ChartSeries {
  key: string;
  name: string;
  color: string;
  categoryId: string;
}

interface ChartRow {
  label: string;
  /** Début du bucket, pour retrouver les vidéos publiées dedans. */
  bucket: string;
  net: number;
  /** Vidéos sorties dans ce bucket, reprises dans l'infobulle avec leur miniature. */
  videos: TooltipVideo[];
  [key: string]: number | string | TooltipVideo[];
}

/** Ce que l'infobulle a besoin de savoir d'une vidéo. */
interface TooltipVideo {
  id: string;
  title: string;
  thumbnailUrl: string | null;
}

/** `r` pour les revenus, `e` pour les dépenses : une catégorie des deux côtés reste distincte. */
const seriesFrom = (items: CategoryBreakdownItem[], prefix: string): ChartSeries[] =>
  items
    .filter((item) => item.totalCents !== 0)
    .map((item, index) => ({
      key: `${prefix}${index}`,
      name: item.categoryName,
      color: item.color,
      categoryId: item.categoryId,
    }));

/**
 * Graphique d'argent, avec les deux réglages demandés :
 * - un interrupteur CA / Bénéfices (le bénéfice retranche les dépenses saisies) ;
 * - une coche pour compter ou non les avantages en nature.
 *
 * Les barres montrent la décomposition par catégorie — chacune avec sa propre couleur,
 * celle de la page Catégories — et la ligne montre la valeur retenue par les réglages :
 * on voit d'où vient l'argent et ce qu'il en reste au même endroit.
 */
export const MoneyChart = ({ data }: MoneyChartProps) => {
  const filters = useFilters();
  const isProfit = filters.moneyMode === 'profit';

  // Les avantages en nature passent en fin de pile, pour rester lisibles au-dessus du cash.
  const revenueSeries = useMemo(() => {
    const items = data.byCategory.filter(
      (item) => filters.includeInKind || item.nature !== 'in_kind',
    );
    const cash = items.filter((item) => item.nature === 'cash');
    const inKind = items.filter((item) => item.nature === 'in_kind');
    return seriesFrom([...cash, ...inKind], 'r');
  }, [data.byCategory, filters.includeInKind]);

  const expenseSeries = useMemo(
    () => (isProfit ? seriesFrom(data.byExpenseCategory, 'e') : []),
    [data.byExpenseCategory, isProfit],
  );

  // Une seule marque par bucket : deux vidéos le même jour donneraient deux traits confondus.
  const videosByBucket = useMemo(() => {
    const map = new Map<string, VideoMarker[]>();
    if (!filters.showVideos) return map;
    for (const video of data.videos) {
      const existing = map.get(video.bucket);
      if (existing) existing.push(video);
      else map.set(video.bucket, [video]);
    }
    return map;
  }, [data.videos, filters.showVideos]);

  const rows = useMemo<ChartRow[]>(
    () =>
      data.series.map((point) => {
        const row: ChartRow = {
          label: formatBucketLabel(point.date, data.query.granularity),
          bucket: point.date,
          net:
            moneyValue(point, { mode: filters.moneyMode, includeInKind: filters.includeInKind }) /
            100,
          videos: (videosByBucket.get(point.date) ?? []).map((video) => ({
            id: video.id,
            title: video.title,
            thumbnailUrl: video.thumbnailUrl,
          })),
        };
        for (const serie of revenueSeries) {
          row[serie.key] = (point.revenueByCategory[serie.categoryId] ?? 0) / 100;
        }
        // Négatif : les dépenses se lisent sous l'axe, en retrait du chiffre d'affaires.
        for (const serie of expenseSeries) {
          row[serie.key] = -(point.expenseByCategory[serie.categoryId] ?? 0) / 100;
        }
        return row;
      }),
    [
      data.series,
      data.query.granularity,
      expenseSeries,
      filters.includeInKind,
      filters.moneyMode,
      revenueSeries,
      videosByBucket,
    ],
  );

  const totals = data.totals;
  const displayedTotal = moneyValue(totals, {
    mode: filters.moneyMode,
    includeInKind: filters.includeInKind,
  });

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle>{isProfit ? 'Bénéfices' : "Chiffre d'affaires"}</CardTitle>
          <p className="mt-1 text-2xl font-semibold tabular">{formatMoney(displayedTotal)}</p>
          <p className="text-xs text-muted-foreground">
            {formatMoney(cashRevenue(totals))} encaissés
            {totals.inKindCents > 0 && ` · ${formatMoney(totals.inKindCents)} en nature`}
            {totals.expenseCents > 0 && ` · ${formatMoney(totals.expenseCents)} de dépenses`}
          </p>
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5">
            <Label
              htmlFor="money-mode"
              className={!isProfit ? 'text-foreground' : 'text-muted-foreground'}
            >
              CA
            </Label>
            <Switch
              id="money-mode"
              checked={isProfit}
              onCheckedChange={(checked) =>
                filters.set({ moneyMode: checked ? 'profit' : 'revenue' })
              }
            />
            <Label
              htmlFor="money-mode"
              className={isProfit ? 'text-foreground' : 'text-muted-foreground'}
            >
              Bénéfices
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="include-in-kind"
              checked={filters.includeInKind}
              onCheckedChange={(checked) => filters.set({ includeInKind: checked === true })}
            />
            <Label htmlFor="include-in-kind" className="text-xs font-normal text-muted-foreground">
              Compter les avantages en nature
            </Label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="show-videos"
              checked={filters.showVideos}
              onCheckedChange={(checked) => filters.set({ showVideos: checked === true })}
            />
            <Label
              htmlFor="show-videos"
              className="text-xs font-normal text-muted-foreground"
              title={
                data.videos.length === 0
                  ? 'Aucune sortie connue sur la période. Les vidéos sont enregistrées à chaque collecte.'
                  : undefined
              }
            >
              Marquer les sorties de vidéo
              {data.videos.length > 0 && ` (${data.videos.length})`}
            </Label>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              minTickGap={16}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              width={64}
              tickFormatter={(value: number) => formatMoneyCompact(value * 100)}
            />
            <Tooltip content={<MoneyTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value: string) => <span className="text-muted-foreground">{value}</span>}
            />
            {/* Repère du zéro : indispensable dès que les dépenses creusent sous l'axe. */}
            <ReferenceLine y={0} stroke="var(--color-border)" />

            {revenueSeries.map((serie, index) => (
              <Bar
                key={serie.key}
                dataKey={serie.key}
                name={serie.name}
                stackId="revenue"
                fill={serie.color}
                radius={index === revenueSeries.length - 1 ? [3, 3, 0, 0] : undefined}
              />
            ))}

            {expenseSeries.map((serie, index) => (
              <Bar
                key={serie.key}
                dataKey={serie.key}
                name={serie.name}
                stackId="expense"
                fill={serie.color}
                fillOpacity={0.75}
                radius={index === expenseSeries.length - 1 ? [0, 0, 3, 3] : undefined}
              />
            ))}

            {/* Un trait par bucket contenant au moins une sortie ; le détail est dans l'infobulle. */}
            {rows
              .filter((row) => row.videos.length > 0)
              .map((row) => (
                <ReferenceLine
                  key={row.bucket}
                  x={row.label}
                  stroke="var(--color-muted-foreground)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.65}
                  label={{
                    value: row.videos.length > 1 ? `▾ ${row.videos.length}` : '▾',
                    position: 'top',
                    fontSize: 10,
                    fill: 'var(--color-muted-foreground)',
                  }}
                />
              ))}

            <Line
              type="monotone"
              dataKey="net"
              name={isProfit ? 'Bénéfice' : "Chiffre d'affaires"}
              stroke="var(--color-foreground)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

interface TooltipEntry {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
}

const MoneyTooltip = ({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: (TooltipEntry & { payload?: { videos?: TooltipVideo[] } })[];
  label?: string;
}) => {
  if (!active || !payload?.length) return null;

  const videos = payload[0]?.payload?.videos ?? [];

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-popover-foreground">{label}</p>
      {payload
        .filter((entry) => entry.value !== undefined && entry.value !== 0)
        .map((entry) => (
          <div key={entry.dataKey} className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.color }}
                aria-hidden
              />
              {entry.name}
            </span>
            <span className="tabular text-popover-foreground">
              {formatMoney((entry.value ?? 0) * 100)}
            </span>
          </div>
        ))}

      {videos.length > 0 && (
        <div className="mt-2 space-y-1.5 border-t border-border pt-2">
          <p className="text-[11px] font-medium text-popover-foreground">
            {videos.length} vidéo{videos.length > 1 ? 's' : ''} publiée
            {videos.length > 1 ? 's' : ''}
          </p>
          {videos.slice(0, 3).map((video) => (
            <div key={video.id} className="flex items-center gap-2">
              {video.thumbnailUrl && (
                <img
                  src={video.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="h-9 w-16 shrink-0 rounded object-cover"
                />
              )}
              <span className="line-clamp-2 text-muted-foreground" style={{ maxWidth: 180 }}>
                {video.title}
              </span>
            </div>
          ))}
          {videos.length > 3 && (
            <p className="text-muted-foreground">et {videos.length - 3} de plus…</p>
          )}
        </div>
      )}
    </div>
  );
};
