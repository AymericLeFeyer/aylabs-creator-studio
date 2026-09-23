import { useMemo, useState } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TikTokSeriesPoint } from '../../../domain/tiktok/entities/TikTok.ts';
import { formatCount } from '../../../domain/tiktok/entities/TikTok.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { formatDate } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';

const COLOR = '#000000';

type Tab = 'followers' | 'hearts';

const TABS: Array<{ id: Tab; label: string; hint: string; unit: string }> = [
  { id: 'followers', label: 'Abonnés', hint: 'Total d’abonnés, jour par jour', unit: 'abonnés' },
  { id: 'hearts', label: 'Coeurs', hint: 'Total de coeurs reçus, jour par jour', unit: 'coeurs' },
];

/**
 * Les deux cumuls que le profil public de TikTok donne de façon fiable : abonnés et
 * coeurs. **Pas d'onglet Vidéos** : TikTok ne renvoie plus la liste des vidéos dans le
 * HTML de la page publique (vérifié sur plusieurs comptes, pas propre à un seul) — un
 * graphique qui resterait figé à zéro ferait plus mal que pas de graphique du tout.
 * `TikTokSeriesPoint.videos` reste dans le contrat pour le jour où une lecture par
 * navigateur (comme Domadoo) rendrait le compte fiable.
 */
export const TikTokChart = ({ series }: { series: TikTokSeriesPoint[] }) => {
  const [tab, setTab] = useState<Tab>('followers');
  const privacy = usePrivacy();
  const masked = privacy.isMasked('subscribers');

  const rows = useMemo(
    () =>
      series.map((point) => ({
        date: point.date,
        followers: masked ? 0 : point.followers,
        hearts: masked ? 0 : point.hearts,
      })),
    [series, masked],
  );

  const key = tab === 'followers' ? 'followers' : 'hearts';
  const domain = useMemo((): [number, number] => {
    const values = rows.map((row) => row[key]).filter((value) => value !== null);
    if (values.length === 0) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(1, Math.round((max - min) * 0.1));
    return [Math.max(0, min - pad), max + pad];
  }, [rows, key]);

  const empty = rows.every((row) => row[key] === null);
  const unit = TABS.find((entry) => entry.id === tab)!.unit;

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

      {empty ? (
        <p className="py-12 text-center text-sm text-muted-foreground">
          Aucun relevé sur cette période.
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) => formatDate(value)}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              minTickGap={24}
            />
            <YAxis
              domain={domain}
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              width={48}
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const value = payload[0]?.value;
                return (
                  <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                    <p className="mb-1 text-[11px] text-muted-foreground">
                      {formatDate(String(label))}
                    </p>
                    <p className="font-semibold tabular text-popover-foreground">
                      {typeof value !== 'number' ? '—' : `${formatCount(value)} ${unit}`}
                    </p>
                  </div>
                );
              }}
            />
            {/* `connectNulls` : un bucket sans relevé ne doit pas briser la courbe. */}
            <Line
              type="monotone"
              dataKey={key}
              stroke={COLOR}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
};
