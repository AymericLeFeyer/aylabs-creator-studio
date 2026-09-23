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
import type { TikTokSeriesPoint } from '../../../domain/tiktok/entities/TikTok.ts';
import { formatCount } from '../../../domain/tiktok/entities/TikTok.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { formatDate } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';

const COLOR = '#000000';

type Tab = 'followers' | 'videos';

const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'followers', label: 'Abonnés', hint: 'Total d’abonnés, jour par jour' },
  { id: 'videos', label: 'Vidéos', hint: 'Vidéos publiées, par jour' },
];

/**
 * Les deux lectures de l'historique TikTok : le total d'abonnés (un cumul, en ligne) et
 * les vidéos publiées (un flux, en barres) — même découpage que les autres graphiques du
 * studio (Domadoo, Instagram).
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
        videos: point.videos,
      })),
    [series, masked],
  );

  const domain = useMemo((): [number, number] => {
    const values = rows.map((row) => row.followers).filter((value) => value !== null);
    if (values.length === 0) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(1, Math.round((max - min) * 0.1));
    return [Math.max(0, min - pad), max + pad];
  }, [rows]);

  const empty =
    tab === 'followers'
      ? rows.every((row) => row.followers === null)
      : rows.every((row) => row.videos === 0);

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
          {tab === 'followers'
            ? 'Aucun relevé d’abonnés sur cette période.'
            : 'Aucune vidéo listée sur cette période.'}
        </p>
      ) : (
        <ResponsiveContainer width="100%" height={260}>
          {tab === 'followers' ? (
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
                        {typeof value !== 'number' ? '—' : `${formatCount(value)} abonnés`}
                      </p>
                    </div>
                  );
                }}
              />
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
                        {typeof value !== 'number' ? '—' : `${formatCount(value)} vidéo(s)`}
                      </p>
                    </div>
                  );
                }}
              />
              <Bar dataKey="videos" fill={COLOR} radius={[3, 3, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
};
