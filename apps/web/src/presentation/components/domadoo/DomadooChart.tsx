import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

type MoneyKey = (typeof MONEY_LINES)[number]['key'];

const CLICKS_COLOR = 'var(--primary)';

type Tab = 'money' | 'clicks';

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  {
    id: 'money',
    label: 'Solde et en attente',
    hint: 'Solde et commissions en attente empilés : la barre entière est le total théorique',
  },
  { id: 'clicks', label: 'Clics (30 j)', hint: 'Clics par jour sur les 30 derniers jours' },
];

/**
 * Les deux lectures de l'historique Domadoo.
 *
 * **Argent** : deux ÉTATS en barres **empilées** — le **solde** (ce qui est acquis et dû)
 * en bas, les **commissions en attente** (ce qui le rejoindra à la validation) au-dessus.
 * La hauteur de la barre est le total théorique du compte ; la légende masque ou
 * réaffiche chaque série. Les gains par jour, qui tenaient ce rôle avant, ne bougeaient
 * qu'au rythme des validations de Domadoo et ne représentaient pas l'activité.
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
 * Solde et commissions en attente **empilés** : la hauteur de la barre est le total
 * théorique du compte — ce qu'il vaudra une fois les ventes en attente validées —, et
 * chaque segment dit d'où il vient.
 *
 * La légende est cliquable : un clic masque ou réaffiche une série. Masquée, elle est
 * retirée des barres **et** du total de l'infobulle, qui ne compte que ce qui est affiché —
 * sinon la barre et le chiffre annoncé au-dessus ne tomberaient plus d'accord.
 *
 * Confidentialité : `0`, pas une série retirée — un trou dans une pile dont le total
 * resterait connu se lirait aussi bien qu'une valeur.
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
  const [hidden, setHidden] = useState<ReadonlySet<MoneyKey>>(() => new Set());
  const visible = MONEY_LINES.filter((line) => !hidden.has(line.key));

  const rows = useMemo(() => {
    const euros = (value: number | null): number | null =>
      masked ? 0 : value === null ? null : value / 100;
    return series.map((point) => ({
      date: point.date,
      balance: euros(point.balanceCents),
      waiting: euros(point.waitingSalesCents),
    }));
  }, [series, masked]);

  const toggle = (key: MoneyKey) =>
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (rows.every((row) => row.balance === null && row.waiting === null)) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Aucun relevé sur cette période.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-2 gap-y-1 text-xs">
        {MONEY_LINES.map((line) => {
          const off = hidden.has(line.key);
          return (
            <button
              key={line.key}
              type="button"
              onClick={() => toggle(line.key)}
              aria-pressed={!off}
              title={off ? 'Afficher' : 'Masquer'}
              className={cn(
                'flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-muted',
                off ? 'text-muted-foreground/60 line-through' : 'text-muted-foreground',
              )}
            >
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: off ? 'var(--border)' : line.color }}
                aria-hidden
              />
              {line.label}
            </button>
          );
        })}
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
          <XAxis {...axisProps(granularity)} />
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
              const values = visible.map((line) => {
                const value = payload.find((entry) => entry.dataKey === line.key)?.value;
                return { line, value: typeof value === 'number' ? value : null };
              });
              const known = values.filter((entry) => entry.value !== null);
              const total = known.reduce((sum, entry) => sum + entry.value!, 0);
              return (
                <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                  <p className="mb-1 text-[11px] text-muted-foreground">
                    {formatBucketLabel(String(label), granularity)}
                  </p>
                  {values.map(({ line, value }) => (
                    <p key={line.key} className="flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <span
                          className="h-2 w-2 rounded-sm"
                          style={{ backgroundColor: line.color }}
                          aria-hidden
                        />
                        {line.label}
                      </span>
                      <span className="font-semibold tabular text-popover-foreground">
                        {value === null
                          ? '—'
                          : privacy.money(Math.round(value * 100), 'affiliation')}
                      </span>
                    </p>
                  ))}
                  {visible.length > 1 && known.length > 0 && (
                    <p className="mt-1 flex items-center justify-between gap-4 border-t border-border pt-1">
                      <span className="text-muted-foreground">Total théorique</span>
                      <span className="font-semibold tabular text-popover-foreground">
                        {privacy.money(Math.round(total * 100), 'affiliation')}
                      </span>
                    </p>
                  )}
                </div>
              );
            }}
          />
          {/* Le solde en bas : c'est l'acquis, l'en-attente s'y ajoute. Seul le segment du
              haut est arrondi, pour que la pile se lise comme une seule barre. */}
          {visible.map((line, index) => (
            <Bar
              key={line.key}
              dataKey={line.key}
              stackId="money"
              fill={line.color}
              radius={index === visible.length - 1 ? [3, 3, 0, 0] : 0}
            />
          ))}
        </BarChart>
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
