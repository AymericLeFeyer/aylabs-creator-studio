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
import type { InstagramSeriesPoint } from '../../../domain/instagram/entities/Instagram.ts';
import { formatCount } from '../../../domain/instagram/entities/Instagram.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { formatDate } from '../../../shared/format.ts';

const SERIES = [
  { key: 'stories', name: 'Stories', color: '#e1306c' },
  { key: 'posts', name: 'Publications', color: '#833ab4' },
  { key: 'gained', name: 'Abonnés gagnés', color: '#f77737' },
] as const;

/**
 * L'activité de chaque jour d'un coup d'œil : **stories, publications et abonnés gagnés**
 * sur un même graphique. C'est la question qu'on vient poser en premier sur cet écran —
 * « est-ce que publier fait venir du monde ? » — et elle ne se lit qu'en voyant les trois
 * côte à côte, jour par jour.
 *
 * Un seul axe pour les trois, alors que le total d'abonnés a son propre onglet : ils comptent
 * des unités par jour, du même ordre de grandeur (quelques stories, une publication,
 * quelques abonnés).
 * Stories et publications en barres (ce qu'on a fait), le gain en ligne (ce qui en résulte) :
 * la ligne passe **par-dessus** les barres et le décalage d'un jour se voit.
 *
 * Abonnés masqués par la confidentialité : la ligne tombe à zéro, elle ne disparaît pas.
 */
export const ActivityChart = ({ series }: { series: InstagramSeriesPoint[] }) => {
  const privacy = usePrivacy();
  const masked = privacy.isMasked('subscribers');

  const rows = useMemo(
    () =>
      series.map((point) => ({
        date: point.date,
        stories: point.stories,
        posts: point.posts,
        gained: masked ? 0 : point.followersGained,
      })),
    [series, masked],
  );

  const empty = rows.every(
    (row) => row.stories === 0 && row.posts === 0 && (row.gained === null || row.gained === 0),
  );

  if (empty) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Rien sur cette période. Déclare tes stories au-dessus : elles apparaîtront ici.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(value: string) => formatDate(value)}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          minTickGap={24}
        />
        <YAxis
          allowDecimals={false}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          width={32}
        />
        <ReferenceLine y={0} stroke="var(--border)" />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                <p className="mb-1 text-[11px] text-muted-foreground">
                  {formatDate(String(label))}
                </p>
                {payload.map((entry) => (
                  <p key={String(entry.name)} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: entry.color }}
                      aria-hidden
                    />
                    <span className="text-muted-foreground">{entry.name}</span>
                    <span className="ml-auto pl-3 font-semibold tabular text-popover-foreground">
                      {typeof entry.value === 'number' ? formatCount(entry.value) : '—'}
                    </span>
                  </p>
                ))}
              </div>
            );
          }}
        />
        <Bar dataKey="stories" name={SERIES[0].name} fill={SERIES[0].color} radius={[3, 3, 0, 0]} />
        <Bar dataKey="posts" name={SERIES[1].name} fill={SERIES[1].color} radius={[3, 3, 0, 0]} />
        <Line
          type="monotone"
          dataKey="gained"
          name={SERIES[2].name}
          stroke={SERIES[2].color}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};
