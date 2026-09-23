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
import { formatBucketLabel, formatMoney } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';

const CASH_COLOR = 'var(--cash)';

type Tab = 'gains' | 'balance';

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'gains', label: 'Gains', hint: 'Commissions validées gagnées par bucket' },
  { id: 'balance', label: 'Solde', hint: 'Solde du compte Domadoo, jour par jour' },
];

/**
 * Les deux lectures de l'historique Domadoo : ce qui a été **gagné** sur chaque bucket
 * (un flux, en barres — reconstruit par différence de deux relevés cumulatifs), et le
 * **solde** du compte (un état, en ligne — le dernier relevé connu de chaque bucket).
 *
 * Deux onglets plutôt qu'un double axe : un gain de quelques dizaines d'euros et un solde
 * qui peut en cumuler des centaines n'ont pas la même échelle.
 */
export const DomadooChart = ({
  series,
  granularity,
}: {
  series: DomadooSeriesPoint[];
  granularity: 'day' | 'week' | 'month';
}) => {
  const [tab, setTab] = useState<Tab>('gains');

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

      {tab === 'gains' ? (
        <GainsChart series={series} granularity={granularity} />
      ) : (
        <BalanceChart series={series} granularity={granularity} />
      )}
    </div>
  );
};

/**
 * Masqué comme n'importe quel montant d'affiliation : `0`, pas une barre retirée — un
 * trou dans une série dont le total resterait connu se lirait aussi bien qu'une valeur.
 */
const useRows = (series: DomadooSeriesPoint[]) => {
  const privacy = usePrivacy();
  const masked = privacy.isMasked('affiliation');
  return useMemo(() => {
    const cents = (value: number | null): number | null =>
      masked ? 0 : value === null ? null : value / 100;
    return series.map((point) => ({
      date: point.date,
      gained: cents(point.earningsGainedCents),
      balance: cents(point.balanceCents),
    }));
  }, [series, masked]);
};

const GainsChart = ({
  series,
  granularity,
}: {
  series: DomadooSeriesPoint[];
  granularity: 'day' | 'week' | 'month';
}) => {
  const rows = useRows(series);
  const empty = rows.every((row) => row.gained === null);

  if (empty) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Il faut deux relevés pour mesurer un gain.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => formatBucketLabel(value, granularity)}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          minTickGap={24}
        />
        <YAxis
          tickFormatter={(value: number) => formatMoney(value * 100)}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          width={64}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const value = payload[0]?.value;
            return (
              <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="mb-1 text-[11px] text-muted-foreground">
                  {formatBucketLabel(String(label), granularity)}
                </p>
                <p className="font-semibold tabular text-popover-foreground">
                  {typeof value !== 'number' ? '—' : formatMoney(Math.round(value * 100))}
                </p>
              </div>
            );
          }}
        />
        <Bar dataKey="gained" radius={[3, 3, 0, 0]} fill={CASH_COLOR} />
      </BarChart>
    </ResponsiveContainer>
  );
};

const BalanceChart = ({
  series,
  granularity,
}: {
  series: DomadooSeriesPoint[];
  granularity: 'day' | 'week' | 'month';
}) => {
  const rows = useRows(series);
  const empty = rows.every((row) => row.balance === null);

  // Le domaine se calcule sur les valeurs connues : un domaine en texte (« dataMin - 5 »)
  // part en NaN dès qu'un point vaut `null`.
  const domain = useMemo((): [number, number] => {
    const values = rows.map((row) => row.balance).filter((value) => value !== null);
    if (values.length === 0) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(1, Math.round((max - min) * 0.1));
    return [Math.max(0, min - pad), max + pad];
  }, [rows]);

  if (empty) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Aucun relevé de solde sur cette période.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => formatBucketLabel(value, granularity)}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          minTickGap={24}
        />
        <YAxis
          domain={domain}
          tickFormatter={(value: number) => formatMoney(value * 100)}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          width={64}
        />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const value = payload[0]?.value;
            return (
              <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="mb-1 text-[11px] text-muted-foreground">
                  {formatBucketLabel(String(label), granularity)}
                </p>
                <p className="font-semibold tabular text-popover-foreground">
                  {typeof value !== 'number' ? '—' : formatMoney(Math.round(value * 100))}
                </p>
              </div>
            );
          }}
        />
        {/* `connectNulls` : un bucket sans nouveau relevé ne doit pas briser la courbe. */}
        <Line
          type="monotone"
          dataKey="balance"
          stroke={CASH_COLOR}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
};
