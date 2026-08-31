import { useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type {
  AnalyticsResult,
  VideoPerformanceRow,
} from '../../../domain/analytics/entities/Analytics.ts';
import { moneyValue } from '../../../domain/analytics/services/revenueMath.ts';
import { youtubeUrl } from '../../../domain/video/entities/Video.ts';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';

type Metric = 'views' | 'subscribersGained' | 'money';

const METRIC_LABELS: Record<Metric, string> = {
  views: 'Vues',
  subscribersGained: 'Abonnés gagnés',
  money: 'Argent gagné',
};

/** Au-delà, les barres deviennent illisibles : le tableau en dessous garde tout. */
const MAX_BARS = 12;

interface VideoPerformanceChartProps {
  data: AnalyticsResult;
}

/**
 * Performance des vidéos sorties pendant la période.
 *
 * Trois natures de chiffres se croisent ici, et une seule est lisible à la fois — d'où
 * les onglets plutôt qu'un double axe :
 * - les **compteurs** (vues, abonnés) sont des cumuls depuis la sortie, relevés par la
 *   collecte. Ils ne s'additionnent pas avec les totaux de la période, qui comptent
 *   aussi ce que rapportent les vidéos plus anciennes ;
 * - l'**AdSense par vidéo** vient de YouTube Analytics (chaînes OAuth monétisées) ;
 * - les **revenus et dépenses rattachés** viennent de la saisie manuelle, sans borne de
 *   date : une sponso encaissée un mois après la sortie reste imputée à sa vidéo.
 */
export const VideoPerformanceChart = ({ data }: VideoPerformanceChartProps) => {
  const filters = useFilters();
  const [metric, setMetric] = useState<Metric>('views');

  const { moneyMode, includeInKind } = filters;

  const rows = useMemo(
    () =>
      data.videoPerformance.map((video) => ({
        ...video,
        moneyCents: moneyValue(video, { mode: moneyMode, includeInKind }),
      })),
    [data.videoPerformance, moneyMode, includeInKind],
  );

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) =>
        metric === 'money'
          ? b.moneyCents - a.moneyCents
          : metric === 'views'
            ? b.views - a.views
            : b.subscribersGained - a.subscribersGained,
      ),
    [rows, metric],
  );

  const totals = useMemo(
    () =>
      rows.reduce(
        (sum, row) => ({
          views: sum.views + row.views,
          subscribersGained: sum.subscribersGained + row.subscribersGained,
          adsenseCents: sum.adsenseCents + row.adsenseCents,
          manualCashCents: sum.manualCashCents + row.manualCashCents,
          inKindCents: sum.inKindCents + row.inKindCents,
          expenseCents: sum.expenseCents + row.expenseCents,
          moneyCents: sum.moneyCents + row.moneyCents,
        }),
        {
          views: 0,
          subscribersGained: 0,
          adsenseCents: 0,
          manualCashCents: 0,
          inKindCents: 0,
          expenseCents: 0,
          moneyCents: 0,
        },
      ),
    [rows],
  );

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Performance par vidéo</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune sortie sur cette période. Les vidéos et leurs compteurs sont enregistrés à chaque
            collecte.
          </p>
        </CardContent>
      </Card>
    );
  }

  const bars = sorted.slice(0, MAX_BARS);
  const value = (row: (typeof rows)[number]): number =>
    metric === 'money' ? row.moneyCents / 100 : row[metric];

  // Une chaîne par couleur : la légende n'a d'intérêt qu'en vue cumulée.
  const channels = [...new Map(rows.map((row) => [row.channelId, row])).values()];
  const anyStats = rows.some((row) => row.hasStats);

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-4">
        <div>
          <CardTitle>Performance par vidéo</CardTitle>
          <p className="mt-1 text-2xl font-semibold tabular">
            {metric === 'money'
              ? formatMoney(totals.moneyCents)
              : metric === 'subscribersGained'
                ? formatSigned(totals.subscribersGained)
                : formatNumber(totals.views)}
          </p>
          <p className="text-xs text-muted-foreground">
            {rows.length} sortie{rows.length > 1 ? 's' : ''} sur la période
            {metric !== 'money' && ' · cumul depuis la sortie de chaque vidéo'}
          </p>
        </div>

        <Tabs value={metric} onValueChange={(next) => setMetric(next as Metric)}>
          <TabsList>
            {(Object.keys(METRIC_LABELS) as Metric[]).map((key) => (
              <TabsTrigger key={key} value={key} className="text-xs">
                {METRIC_LABELS[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </CardHeader>

      <CardContent className="space-y-4">
        {!anyStats && metric !== 'money' && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            Aucun compteur par vidéo n'a encore été relevé. Lance une collecte : les vues et les
            abonnés par vidéo arrivent avec elle, et seuls les modes « public » et « OAuth » en
            fournissent.
          </p>
        )}

        {/* Barres horizontales : les titres de vidéo se lisent en entier à gauche,
            là où un axe vertical les couperait ou les ferait pivoter. */}
        <ResponsiveContainer width="100%" height={Math.max(140, bars.length * 30 + 24)}>
          <BarChart
            data={bars}
            layout="vertical"
            margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
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
              width={200}
              tick={{ fontSize: 11, fill: 'var(--color-muted-foreground)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(title: string) =>
                title.length > 30 ? `${title.slice(0, 29)}…` : title
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

        {channels.length > 1 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
            {channels.map((channel) => (
              <span key={channel.channelId} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ backgroundColor: channel.channelColor }}
                  aria-hidden
                />
                {channel.channelName}
              </span>
            ))}
          </div>
        )}

        {sorted.length > MAX_BARS && (
          <p className="text-xs text-muted-foreground">
            {MAX_BARS} premières vidéos affichées ; le tableau ci-dessous les liste toutes.
          </p>
        )}

        <VideoPerformanceTable rows={sorted} totals={totals} />
      </CardContent>
    </Card>
  );
};

type Row = VideoPerformanceRow & { moneyCents: number };

/**
 * Le détail chiffré, une colonne par nature d'argent plutôt qu'un seul montant :
 * l'AdSense collecté, les revenus saisis, les avantages en nature et les dépenses ne
 * se remplacent pas et ne se lisent pas de la même façon.
 */
const VideoPerformanceTable = ({
  rows,
  totals,
}: {
  rows: Row[];
  totals: {
    views: number;
    subscribersGained: number;
    adsenseCents: number;
    manualCashCents: number;
    inKindCents: number;
    expenseCents: number;
    moneyCents: number;
  };
}) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Vidéo</TableHead>
        <TableHead className="text-right">Vues</TableHead>
        <TableHead className="text-right">Abonnés</TableHead>
        <TableHead className="text-right">AdSense</TableHead>
        <TableHead className="text-right">Revenus liés</TableHead>
        <TableHead className="text-right">En nature</TableHead>
        <TableHead className="text-right">Dépenses liées</TableHead>
        <TableHead className="text-right">Total</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {rows.map((row) => (
        <TableRow key={row.videoId}>
          <TableCell>
            <div className="flex items-center gap-2.5">
              {row.thumbnailUrl && (
                <img
                  src={row.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="h-8 w-14 shrink-0 rounded object-cover"
                />
              )}
              <div className="min-w-0">
                <a
                  href={youtubeUrl(row.externalId)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 font-medium hover:underline"
                  title={row.title}
                >
                  <span className="line-clamp-1 max-w-[22rem]">{row.title}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
                </a>
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: row.channelColor }}
                    aria-hidden
                  />
                  {row.channelName} · {formatDate(row.date)}
                </span>
              </div>
            </div>
          </TableCell>
          {/* « — » et non « 0 » tant qu'aucune collecte n'a mesuré la vidéo. */}
          <TableCell className="text-right tabular">
            {row.hasStats ? formatNumber(row.views) : '—'}
          </TableCell>
          <TableCell className="text-right tabular">
            {row.hasStats ? formatSigned(row.subscribersGained) : '—'}
          </TableCell>
          <TableCell className="text-right tabular text-muted-foreground">
            {formatMoney(row.adsenseCents)}
          </TableCell>
          <TableCell className="text-right tabular text-muted-foreground">
            {formatMoney(row.manualCashCents)}
          </TableCell>
          <TableCell className="text-right tabular text-[var(--in-kind)]">
            {formatMoney(row.inKindCents)}
          </TableCell>
          <TableCell className="text-right tabular text-[var(--expense)]">
            {row.expenseCents === 0 ? formatMoney(0) : `−${formatMoney(row.expenseCents)}`}
          </TableCell>
          <TableCell className="text-right tabular font-medium">
            {formatMoney(row.moneyCents)}
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
    <tfoot>
      <TableRow className="border-t-2 border-border font-medium hover:bg-transparent">
        <TableCell>Total ({rows.length})</TableCell>
        <TableCell className="text-right tabular">{formatNumber(totals.views)}</TableCell>
        <TableCell className="text-right tabular">
          {formatSigned(totals.subscribersGained)}
        </TableCell>
        <TableCell className="text-right tabular">{formatMoney(totals.adsenseCents)}</TableCell>
        <TableCell className="text-right tabular">{formatMoney(totals.manualCashCents)}</TableCell>
        <TableCell className="text-right tabular text-[var(--in-kind)]">
          {formatMoney(totals.inKindCents)}
        </TableCell>
        <TableCell className="text-right tabular text-[var(--expense)]">
          {totals.expenseCents === 0 ? formatMoney(0) : `−${formatMoney(totals.expenseCents)}`}
        </TableCell>
        <TableCell className="text-right tabular">{formatMoney(totals.moneyCents)}</TableCell>
      </TableRow>
    </tfoot>
  </Table>
);

const VideoTooltip = ({
  active,
  payload,
  metric,
}: {
  active?: boolean;
  payload?: Array<{ payload?: Row }>;
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
