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
import type { DomadooSeriesPoint } from '../../../domain/integration/entities/DomadooOverview.ts';
import { formatBucketLabel, formatMoney, formatNumber } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';

type Granularity = 'day' | 'week' | 'month';

/** Les deux courbes d'argent, et leur couleur — reprise dans la légende et l'infobulle. */
const MONEY_LINES = [
  { key: 'balance', label: 'Solde', color: 'var(--cash)' },
  { key: 'waiting', label: 'Commissions en attente', color: 'var(--expense)' },
] as const;

const CLICKS_COLOR = 'var(--primary)';

type Tab = 'money' | 'clicks';

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  {
    id: 'money',
    label: 'Solde et en attente',
    hint: 'Solde du compte et commissions des ventes pas encore validées, sur la période',
  },
  { id: 'clicks', label: 'Clics (30 j)', hint: 'Clics par jour sur les 30 derniers jours' },
];

/**
 * Les deux lectures de l'historique Domadoo.
 *
 * **Argent** : deux ÉTATS, en courbes sur un même axe — le **solde** (ce qui est acquis et
 * dû) et les **commissions en attente** (ce qui le rejoindra à la validation). Les deux
 * ensemble disent ce que le compte vaut et ce qui arrive ; les gains par jour, qui
 * tenaient ce rôle avant, ne bougeaient qu'au rythme des validations de Domadoo et ne
 * représentaient pas l'activité. Même échelle — ce sont deux montants d'un même compte —,
 * donc un seul axe.
 *
 * **Clics** : un FLUX, en barres, **toujours sur les 30 derniers jours** quelle que soit la
 * période choisie : c'est la fenêtre de Domadoo lui-même, et celle où l'on juge l'effet
 * d'une vidéo sur ses liens. Reconstruit par différence de deux relevés cumulatifs.
 */
export const DomadooChart = ({
  series,
  clicksSeries,
  granularity,
}: {
  series: DomadooSeriesPoint[];
  /** Au jour, sur les 30 derniers jours. */
  clicksSeries: DomadooSeriesPoint[];
  granularity: Granularity;
}) => {
  const [tab, setTab] = useState<Tab>('money');

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

      {tab === 'money' ? (
        <MoneyChart series={series} granularity={granularity} />
      ) : (
        <ClicksChart series={clicksSeries} />
      )}
    </div>
  );
};

const axisProps = (granularity: Granularity) => ({
  dataKey: 'date',
  tickFormatter: (value: string) => formatBucketLabel(value, granularity),
  tick: { fontSize: 11 },
  stroke: 'var(--muted-foreground)',
  minTickGap: 24,
});

/**
 * Masqué comme n'importe quel montant d'affiliation : `0`, pas une courbe retirée — un
 * trou dans une série dont le total resterait connu se lirait aussi bien qu'une valeur.
 */
const MoneyChart = ({
  series,
  granularity,
}: {
  series: DomadooSeriesPoint[];
  granularity: Granularity;
}) => {
  const privacy = usePrivacy();
  const masked = privacy.isMasked('affiliation');
  const rows = useMemo(() => {
    const euros = (value: number | null): number | null =>
      masked ? 0 : value === null ? null : value / 100;
    return series.map((point) => ({
      date: point.date,
      balance: euros(point.balanceCents),
      waiting: euros(point.waitingSalesCents),
    }));
  }, [series, masked]);

  // Le domaine se calcule sur les valeurs connues : un domaine en texte (« dataMin - 5 »)
  // part en NaN dès qu'un point vaut `null`.
  const domain = useMemo((): [number, number] => {
    const values = rows
      .flatMap((row) => [row.balance, row.waiting])
      .filter((value): value is number => value !== null);
    if (values.length === 0) return [0, 1];
    const max = Math.max(...values);
    return [0, Math.max(1, Math.ceil(max * 1.1))];
  }, [rows]);

  if (rows.every((row) => row.balance === null && row.waiting === null)) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Aucun relevé sur cette période.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {MONEY_LINES.map((line) => (
          <span key={line.key} className="flex items-center gap-1.5 text-muted-foreground">
            <span
              className="h-0.5 w-4 rounded-full"
              style={{ backgroundColor: line.color }}
              aria-hidden
            />
            {line.label}
          </span>
        ))}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis {...axisProps(granularity)} />
          <YAxis
            domain={domain}
            tickFormatter={(value: number) => formatMoney(value * 100)}
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            width={64}
          />
          <Tooltip
            cursor={{ stroke: 'var(--border)' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    {formatBucketLabel(String(label), granularity)}
                  </p>
                  {MONEY_LINES.map((line) => {
                    const value = payload.find((entry) => entry.dataKey === line.key)?.value;
                    return (
                      <p key={line.key} className="flex items-center justify-between gap-4">
                        <span className="flex items-center gap-1.5 text-muted-foreground">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: line.color }}
                            aria-hidden
                          />
                          {line.label}
                        </span>
                        <span className="font-semibold tabular text-popover-foreground">
                          {typeof value !== 'number'
                            ? '—'
                            : privacy.money(Math.round(value * 100), 'affiliation')}
                        </span>
                      </p>
                    );
                  })}
                </div>
              );
            }}
          />
          {/* `connectNulls` : un jour sans nouveau relevé ne doit pas briser la courbe. */}
          {MONEY_LINES.map((line) => (
            <Line
              key={line.key}
              type="monotone"
              dataKey={line.key}
              stroke={line.color}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const ClicksChart = ({ series }: { series: DomadooSeriesPoint[] }) => {
  const rows = series.map((point) => ({ date: point.date, clicks: point.clicksGained }));
  const total = rows.reduce((sum, row) => sum + (row.clicks ?? 0), 0);

  if (rows.every((row) => row.clicks === null)) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Il faut deux relevés pour mesurer des clics.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        <span className="font-semibold tabular text-foreground">{formatNumber(total)}</span> clics
        sur les 30 derniers jours
      </p>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis {...axisProps('day')} />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            width={40}
          />
          <Tooltip
            cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const value = payload[0]?.value;
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    {formatBucketLabel(String(label), 'day')}
                  </p>
                  <p className="font-semibold tabular text-popover-foreground">
                    {typeof value !== 'number' ? '—' : `${formatNumber(value)} clic(s)`}
                  </p>
                </div>
              );
            }}
          />
          <Bar dataKey="clicks" radius={[3, 3, 0, 0]} fill={CLICKS_COLOR} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
