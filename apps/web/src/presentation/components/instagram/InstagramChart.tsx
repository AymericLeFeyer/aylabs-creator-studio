import { useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { InstagramSeriesPoint } from '../../../domain/instagram/entities/Instagram.ts';
import { formatCount } from '../../../domain/instagram/entities/Instagram.ts';
import { formatDate } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';

type Metric = 'stories' | 'reach' | 'followers';

const METRICS: Array<{ id: Metric; label: string; hint: string }> = [
  { id: 'stories', label: 'Publications', hint: 'Stories et publications par période' },
  { id: 'reach', label: 'Portée', hint: 'Comptes uniques touchés' },
  { id: 'followers', label: 'Abonnés', hint: 'Total et gain par période' },
];

export interface InstagramChartProps {
  series: InstagramSeriesPoint[];
  granularity: 'day' | 'week' | 'month';
}

/**
 * Les trois lectures d'un compte Instagram, en onglets plutôt qu'en axes superposés.
 *
 * Des stories (quelques unités), une portée (quelques milliers) et un total d'abonnés
 * (quelques dizaines de milliers) n'ont pas la même échelle : les empiler sur deux axes
 * ferait lire des corrélations inventées. Même parti pris que le graphique de performance
 * par vidéo.
 *
 * Les **stories sont des barres et les abonnés une ligne** : un flux se compte par
 * période, un cumul se suit. Confondre les deux ferait additionner des abonnés d'un jour
 * sur l'autre.
 */
export const InstagramChart = ({ series, granularity }: InstagramChartProps) => {
  const [metric, setMetric] = useState<Metric>('stories');

  const empty = series.every(
    (point) => point.stories === 0 && point.posts === 0 && point.reach === null,
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center rounded-md border border-border p-0.5">
          {METRICS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setMetric(entry.id)}
              title={entry.hint}
              className={cn(
                'rounded px-2.5 py-1 text-xs font-medium transition-colors',
                metric === entry.id
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {METRICS.find((entry) => entry.id === metric)?.hint}
        </p>
      </div>

      {empty ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Rien de collecté sur cette période.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatDate(value)}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
            />
            <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" width={48} />
            {/* Contenu écrit à la main plutôt que `formatter` : c'est le pattern des
                autres graphiques du projet, et les types de Recharts pour les formatters
                admettent `undefined` là où on veut un nombre. */}
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const prefix =
                  granularity === 'month'
                    ? 'Mois du '
                    : granularity === 'week'
                      ? 'Semaine du '
                      : '';
                return (
                  <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="mb-1 text-[11px] text-muted-foreground">
                      {prefix}
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
                        <span className="ml-auto font-semibold tabular text-popover-foreground">
                          {typeof entry.value === 'number' ? formatCount(entry.value) : '—'}
                        </span>
                      </p>
                    ))}
                  </div>
                );
              }}
            />

            {metric === 'stories' && (
              <>
                <Bar dataKey="stories" name="Stories" fill="#e1306c" radius={[3, 3, 0, 0]} />
                <Bar dataKey="posts" name="Publications" fill="#833ab4" radius={[3, 3, 0, 0]} />
              </>
            )}

            {metric === 'reach' && (
              <>
                <Bar dataKey="reach" name="Portée" fill="#405de6" radius={[3, 3, 0, 0]} />
                <Bar
                  dataKey="totalInteractions"
                  name="Interactions"
                  fill="#f77737"
                  radius={[3, 3, 0, 0]}
                />
              </>
            )}

            {metric === 'followers' && (
              <>
                <Bar
                  dataKey="followersGained"
                  name="Gain d’abonnés"
                  fill="#e1306c"
                  radius={[3, 3, 0, 0]}
                />
                {/* La ligne des abonnés est un CUMUL : `connectNulls` la fait traverser les
                    périodes sans relevé, sinon elle se briserait au premier trou de
                    collecte. */}
                <Line
                  type="monotone"
                  dataKey="followers"
                  name="Abonnés"
                  stroke="#833ab4"
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              </>
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
