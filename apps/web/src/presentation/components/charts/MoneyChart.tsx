import { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
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
} from '../../../domain/analytics/entities/Analytics.ts';
import { cashRevenue } from '../../../domain/analytics/services/revenueMath.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import { formatBucketLabel, formatMoney, formatMoneyCompact } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Label } from '../ui/label.tsx';
import { Switch } from '../ui/switch.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import {
  groupVideosByBucket,
  videoMarkerLines,
  type MarkerRow,
  type TooltipVideo,
} from './videoMarkers.tsx';
import { VideoMarkersToggle } from './VideoMarkersToggle.tsx';
import { VideoTooltipList } from './VideoTooltipList.tsx';
import { SYNC_ID } from './syncId.ts';

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
  /** Identité stable de la série, indépendante de son rang : clé du masquage. */
  toggleId: string;
}

interface ChartRow extends MarkerRow {
  net: number;
  [key: string]: number | string | TooltipVideo[];
}

/**
 * `r` pour les revenus, `e` pour les dépenses : une catégorie présente des deux côtés
 * (portée `both`) reste deux séries distinctes, une au-dessus de l'axe et une en dessous.
 */
const seriesFrom = (items: CategoryBreakdownItem[], prefix: string): ChartSeries[] =>
  items
    .filter((item) => item.totalCents !== 0)
    .map((item, index) => ({
      key: `${prefix}${index}`,
      name: item.categoryName,
      color: item.color,
      categoryId: item.categoryId,
      toggleId: `${prefix}:${item.categoryId}`,
    }));

/**
 * Graphique d'argent, avec les réglages demandés :
 * - un interrupteur CA / Bénéfices (le bénéfice retranche les dépenses saisies) ;
 * - une coche pour compter ou non les avantages en nature ;
 * - une légende cliquable pour retirer une catégorie de la vue.
 *
 * Les barres montrent la décomposition par catégorie — chacune avec sa propre couleur,
 * celle de la page Catégories — et la ligne montre la valeur retenue par les réglages :
 * on voit d'où vient l'argent et ce qu'il en reste au même endroit.
 */
export const MoneyChart = ({ data }: MoneyChartProps) => {
  const filters = useFilters();
  const isProfit = filters.moneyMode === 'profit';

  /**
   * Catégories retirées de la vue, par identité stable (`r:id` / `e:id`) et non par
   * rang : un changement de période réordonne les barres sans dépareiller le masquage.
   * L'état est volontairement local — c'est un réglage de lecture, pas un filtre.
   */
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const toggle = (toggleId: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(toggleId)) next.delete(toggleId);
      else next.add(toggleId);
      return next;
    });

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

  const visibleRevenue = revenueSeries.filter((serie) => !hidden.has(serie.toggleId));
  const visibleExpense = expenseSeries.filter((serie) => !hidden.has(serie.toggleId));
  const hiddenCount = [...revenueSeries, ...expenseSeries].filter((serie) =>
    hidden.has(serie.toggleId),
  ).length;

  const videosByBucket = useMemo(
    () => groupVideosByBucket(data.videos, filters.showVideos),
    [data.videos, filters.showVideos],
  );

  /**
   * La ligne suit les catégories **visibles** : masquer « Sponsors » doit retirer les
   * sponsors du total lu, sinon la ligne resterait au-dessus de la pile qui la porte.
   * Tant que rien n'est masqué, la somme est celle de `moneyValue`.
   */
  const rows = useMemo<ChartRow[]>(
    () =>
      data.series.map((point) => {
        const row: ChartRow = {
          label: formatBucketLabel(point.date, data.query.granularity),
          bucket: point.date,
          net: 0,
          videos: videosByBucket.get(point.date) ?? [],
        };

        let net = 0;
        for (const serie of visibleRevenue) {
          const cents = point.revenueByCategory[serie.categoryId] ?? 0;
          row[serie.key] = cents / 100;
          net += cents;
        }
        // Négatif : les dépenses se lisent sous l'axe, en retrait du chiffre d'affaires.
        for (const serie of visibleExpense) {
          const cents = point.expenseByCategory[serie.categoryId] ?? 0;
          row[serie.key] = -cents / 100;
          net -= cents;
        }
        row.net = net / 100;
        return row;
      }),
    [data.series, data.query.granularity, videosByBucket, visibleRevenue, visibleExpense],
  );

  const totals = data.totals;
  const displayedTotal = rows.reduce((sum, row) => sum + row.net, 0) * 100;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle>{isProfit ? 'Bénéfices' : "Chiffre d'affaires"}</CardTitle>
          <p className="mt-1 text-2xl font-semibold tabular">{formatMoney(displayedTotal)}</p>
          <p className="text-xs text-muted-foreground">
            {hiddenCount > 0 ? (
              <>
                {hiddenCount} catégorie{hiddenCount > 1 ? 's' : ''} masquée
                {hiddenCount > 1 ? 's' : ''} ·{' '}
                <button
                  type="button"
                  onClick={() => setHidden(new Set())}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  tout afficher
                </button>
              </>
            ) : (
              <>
                {formatMoney(cashRevenue(totals))} encaissés
                {totals.inKindCents > 0 && ` · ${formatMoney(totals.inKindCents)} en nature`}
                {totals.expenseCents > 0 && ` · ${formatMoney(totals.expenseCents)} de dépenses`}
              </>
            )}
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

          <VideoMarkersToggle id="show-videos-money" count={data.videos.length} />
        </div>
      </CardHeader>

      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          {/* `syncId` aligne le survol sur celui du graphique d'audience : même abscisse,
              donc même point lu des deux côtés en même temps. */}
          <ComposedChart
            data={rows}
            syncId={SYNC_ID}
            margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
          >
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
            <Tooltip
              content={<MoneyTooltip title={isProfit ? 'Bénéfice' : "Chiffre d'affaires"} />}
            />
            {/* Repère du zéro : indispensable dès que les dépenses creusent sous l'axe. */}
            <ReferenceLine y={0} stroke="var(--color-border)" />

            {visibleRevenue.map((serie, index) => (
              <Bar
                key={serie.key}
                dataKey={serie.key}
                name={serie.name}
                stackId="revenue"
                fill={serie.color}
                radius={index === visibleRevenue.length - 1 ? [3, 3, 0, 0] : undefined}
              />
            ))}

            {visibleExpense.map((serie, index) => (
              <Bar
                key={serie.key}
                dataKey={serie.key}
                name={serie.name}
                stackId="expense"
                fill={serie.color}
                fillOpacity={0.75}
                radius={index === visibleExpense.length - 1 ? [0, 0, 3, 3] : undefined}
              />
            ))}

            {/* Un trait par bucket contenant au moins une sortie ; le détail est dans l'infobulle. */}
            {videoMarkerLines(rows)}

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

        <ChartLegend
          series={[...revenueSeries, ...expenseSeries]}
          hidden={hidden}
          onToggle={toggle}
        />
      </CardContent>
    </Card>
  );
};

/**
 * Légende cliquable, en HTML plutôt qu'avec la légende de Recharts : une cible de clic
 * confortable, et le masquage retire vraiment la série du graphique et de l'infobulle
 * au lieu de la laisser dans les données.
 */
const ChartLegend = ({
  series,
  hidden,
  onToggle,
}: {
  series: ChartSeries[];
  hidden: Set<string>;
  onToggle: (toggleId: string) => void;
}) => {
  if (series.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {series.map((serie) => {
        const isHidden = hidden.has(serie.toggleId);
        return (
          <button
            key={serie.toggleId}
            type="button"
            onClick={() => onToggle(serie.toggleId)}
            aria-pressed={!isHidden}
            title={isHidden ? `Afficher ${serie.name}` : `Masquer ${serie.name}`}
            className={cn(
              'flex items-center gap-1.5 rounded px-1 py-0.5 text-xs transition-colors',
              isHidden
                ? 'text-muted-foreground/50 line-through'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: serie.color, opacity: isHidden ? 0.3 : 1 }}
              aria-hidden
            />
            {serie.name}
          </button>
        );
      })}
    </div>
  );
};

interface TooltipEntry {
  name?: string;
  value?: number;
  color?: string;
  dataKey?: string;
}

/**
 * Infobulle du graphique d'argent : le montant du bucket d'abord, en gros et en gras,
 * puis le détail par catégorie. Sans ça le total se lisait comme une ligne de plus.
 */
const MoneyTooltip = ({
  active,
  payload,
  label,
  title,
}: {
  active?: boolean;
  payload?: (TooltipEntry & { payload?: ChartRow })[];
  label?: string;
  title: string;
}) => {
  if (!active || !payload?.length) return null;

  const row = payload[0]?.payload;
  const videos = row?.videos ?? [];

  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mb-1.5 text-base font-semibold tabular leading-tight text-popover-foreground">
        {formatMoney((row?.net ?? 0) * 100)}
        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">{title}</span>
      </p>

      {payload
        .filter(
          (entry) => entry.dataKey !== 'net' && entry.value !== undefined && entry.value !== 0,
        )
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

      <VideoTooltipList videos={videos} />
    </div>
  );
};
