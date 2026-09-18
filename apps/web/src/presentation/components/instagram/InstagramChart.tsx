import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { InstagramSeriesPoint } from '../../../domain/instagram/entities/Instagram.ts';
import { formatCount } from '../../../domain/instagram/entities/Instagram.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { formatDate } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';
import { ActivityChart } from './ActivityChart.tsx';

interface FollowersChartProps {
  series: InstagramSeriesPoint[];
  /**
   * `followers` : le total, en ligne — un cumul se suit. `gained` : le gain de chaque jour,
   * en barres — un flux se compte.
   */
  kind: 'followers' | 'gained';
}

const COLOR = '#833ab4';

type Tab = 'activity' | 'followers' | 'gained';

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'activity', label: 'Activité', hint: 'Stories, publications et abonnés gagnés par jour' },
  { id: 'followers', label: 'Abonnés', hint: 'Total d’abonnés, jour par jour' },
  { id: 'gained', label: 'Gain par jour', hint: 'Abonnés gagnés ou perdus chaque jour' },
];

/**
 * Tous les graphiques Instagram **au même endroit, en onglets** : l'activité (stories,
 * publications, abonnés gagnés) d'abord, puis le total d'abonnés et le gain de chaque
 * jour. Des onglets plutôt que des axes superposés : un total de quelques centaines et un
 * gain de quelques unités n'ont pas la même échelle, et les empiler ferait lire des
 * corrélations inventées.
 *
 * `series` est **au jour** : l'écran Instagram la demande toujours à cette maille.
 */
export const InstagramChart = ({ series }: { series: InstagramSeriesPoint[] }) => {
  const [tab, setTab] = useState<Tab>('activity');

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

      {tab === 'activity' ? (
        <ActivityChart series={series} />
      ) : (
        <FollowersChart series={series} kind={tab} />
      )}
    </div>
  );
};

/**
 * Un graphique d'abonnés Instagram.
 *
 * Masqués par la confidentialité, les abonnés tombent à **zéro**, ils ne disparaissent
 * pas : une courbe qui s'arrête et un axe qui se rétrécit disent déjà l'ordre de grandeur
 * de ce qu'on vient de retirer.
 */
const FollowersChart = ({ series, kind }: FollowersChartProps) => {
  const privacy = usePrivacy();
  const masked = privacy.isMasked('subscribers');

  const rows = useMemo(
    () =>
      series.map((point) => ({
        date: point.date,
        followers: masked ? 0 : point.followers,
        gained: masked ? 0 : point.followersGained,
      })),
    [series, masked],
  );

  // Le domaine de la courbe se CALCULE sur les valeurs connues : partir de zéro écraserait
  // une progression de 264 à 270 en trait plat, et un domaine en texte (« dataMin - 5 »)
  // part en NaN dès qu'un jour vaut `null` (voir « Points d'attention »).
  const domain = useMemo((): [number, number] => {
    const values = rows.map((row) => row.followers).filter((value) => value !== null);
    if (values.length === 0) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(1, Math.round((max - min) * 0.1));
    return [Math.max(0, min - pad), max + pad];
  }, [rows]);

  const empty =
    kind === 'followers'
      ? rows.every((row) => row.followers === null)
      : rows.every((row) => row.gained === null);

  if (empty) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {kind === 'followers'
          ? 'Aucun relevé d’abonnés sur cette période.'
          : 'Il faut deux relevés pour mesurer un gain.'}
      </p>
    );
  }

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
      <XAxis
        dataKey="date"
        tickFormatter={(value: string) => formatDate(value)}
        tick={{ fontSize: 11 }}
        stroke="var(--muted-foreground)"
        minTickGap={24}
      />
      {/* Contenu écrit à la main plutôt que `formatter` : c'est le pattern des autres
          graphiques du projet. */}
      <Tooltip
        cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
        content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const value = payload[0]?.value;
          return (
            <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
              <p className="mb-1 text-[11px] text-muted-foreground">{formatDate(String(label))}</p>
              <p className="font-semibold tabular text-popover-foreground">
                {typeof value !== 'number'
                  ? '—'
                  : kind === 'gained'
                    ? `${value > 0 ? '+' : ''}${formatCount(value)} abonné(s)`
                    : `${formatCount(value)} abonnés`}
              </p>
            </div>
          );
        }}
      />
    </>
  );

  return (
    <ResponsiveContainer width="100%" height={260}>
      {kind === 'followers' ? (
        <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {axes}
          <YAxis
            domain={domain}
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            width={48}
          />
          {/* `connectNulls` : un jour sans relevé ne doit pas briser la courbe. */}
          <Line
            type="monotone"
            dataKey="followers"
            stroke={COLOR}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      ) : (
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          {axes}
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            stroke="var(--muted-foreground)"
            width={48}
          />
          <Bar dataKey="gained" radius={[3, 3, 0, 0]}>
            {/* Une perte d'abonnés se lit en rouge : c'est l'information du jour. */}
            {rows.map((row) => (
              <Cell key={row.date} fill={(row.gained ?? 0) < 0 ? 'var(--negative)' : '#e1306c'} />
            ))}
          </Bar>
        </BarChart>
      )}
    </ResponsiveContainer>
  );
};
