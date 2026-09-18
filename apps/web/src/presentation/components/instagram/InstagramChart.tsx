import { useMemo } from 'react';
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

export interface InstagramChartProps {
  /** Une série **au jour** : l'écran Instagram la demande toujours à cette maille. */
  series: InstagramSeriesPoint[];
  /**
   * `followers` : le total, en ligne — un cumul se suit. `gained` : le gain de chaque jour,
   * en barres — un flux se compte. Deux graphiques et non deux onglets : on lit l'un à
   * côté de l'autre, et une journée à +12 se retrouve d'un coup d'œil sur la courbe.
   */
  kind: 'followers' | 'gained';
}

const COLOR = '#833ab4';

/**
 * Un graphique d'abonnés Instagram.
 *
 * Masqués par la confidentialité, les abonnés tombent à **zéro**, ils ne disparaissent
 * pas : une courbe qui s'arrête et un axe qui se rétrécit disent déjà l'ordre de grandeur
 * de ce qu'on vient de retirer.
 */
export const InstagramChart = ({ series, kind }: InstagramChartProps) => {
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
    <ResponsiveContainer width="100%" height={220}>
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
