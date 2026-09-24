import { useMemo } from 'react';
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
import type { InstagramOverview } from '../../../domain/instagram/entities/Instagram.ts';
import { formatCount, variation } from '../../../domain/instagram/entities/Instagram.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { formatDate, formatNumberCompact, formatPercent } from '../../../shared/format.ts';
import { Card, CardContent, CardHeader, CardDescription, CardTitle } from '../ui/card.tsx';
import { groupMediaByDate } from './postMarkers.ts';
import { videoMarkerLines, type MarkerRow } from '../charts/videoMarkers.tsx';
import { VideoTooltipList } from '../charts/VideoTooltipList.tsx';

/** Propre à cet écran : le dashboard a le sien, et les deux ne sont jamais montés ensemble. */
const SYNC_ID = 'acs-instagram';
const FOLLOWERS_COLOR = '#833ab4';
const REACH_COLOR = '#e1306c';

interface Row extends MarkerRow {
  followers: number | null;
  reach: number | null;
}

/** Les lignes communes aux deux graphiques : mêmes buckets, mêmes repères de publication. */
const useRows = (data: InstagramOverview, followersMasked: boolean, reachMasked: boolean) => {
  const postsByDate = useMemo(() => groupMediaByDate(data.media, true), [data.media]);

  return useMemo<Row[]>(
    () =>
      data.series.map((point) => ({
        label: formatDate(point.date),
        bucket: point.date,
        videos: postsByDate.get(point.date) ?? [],
        // Zéro et non absent : un trou dans la série masquée se lirait aussi bien
        // qu'une valeur, même parti pris que le graphique d'audience YouTube.
        followers: followersMasked ? 0 : point.followers,
        reach: reachMasked ? 0 : point.reach,
      })),
    [data.series, postsByDate, followersMasked, reachMasked],
  );
};

/*
 * Abonnés et portée, **côte à côte et liés** — même mécanique que le dashboard entre le
 * graphique d'argent et celui d'audience (`SYNC_ID` commun, deux abscisses identiques).
 * Les publications de la période y sont posées comme repère, exactement comme les sorties
 * de vidéo sur le dashboard YouTube : un pic de portée s'explique souvent par une
 * publication, un plateau d'abonnés par son absence.
 *
 * Toujours à la maille du jour, comme le reste de l'écran Instagram — pas de sélecteur de
 * granularité ici. Deux blocs distincts (`FollowersCard`, `ReachCard`) : ils se posent
 * séparément sur le dashboard, et restent liés dès qu'ils sont montés ensemble.
 */
const axisProps = {
  tick: { fontSize: 11, fill: 'var(--muted-foreground)' },
  tickLine: false,
  axisLine: false,
} as const;

export const FollowersCard = ({ data }: { data: InstagramOverview }) => {
  const privacy = usePrivacy();
  const masked = privacy.isMasked('subscribers');
  const rows = useRows(data, masked, privacy.isMasked('views'));

  const total = masked ? null : data.totals.followers;
  const change = variation(data.totals.followers, data.previousTotals?.followers ?? null);

  // Le domaine se calcule sur les valeurs connues : partir de zéro écraserait une
  // progression de 264 à 270 en trait plat, même piège que `FollowersChart`.
  const domain = useMemo((): [number, number] => {
    const values = rows.map((row) => row.followers).filter((value) => value !== null);
    if (values.length === 0) return [0, 1];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = Math.max(1, Math.round((max - min) * 0.1));
    return [Math.max(0, min - pad), max + pad];
  }, [rows]);

  const empty = rows.every((row) => row.followers === null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Abonnés</CardTitle>
        <p className="mt-1 text-2xl font-semibold tabular">
          {total === null ? (masked ? '•••' : '—') : formatCount(total)}
        </p>
        <CardDescription className="text-xs text-muted-foreground">
          {change === null
            ? 'pas de période de comparaison'
            : `${formatPercent(change)} vs période précédente`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            Aucun relevé d’abonnés sur cette période.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart
              data={rows}
              syncId={SYNC_ID}
              margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" minTickGap={16} {...axisProps} />
              <YAxis
                domain={domain}
                allowDecimals={false}
                width={52}
                tickFormatter={formatNumberCompact}
                {...axisProps}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const value = payload[0]?.value;
                  const videos = (payload[0]?.payload as Row | undefined)?.videos ?? [];
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                      <p className="text-base font-semibold tabular leading-tight text-popover-foreground">
                        {typeof value === 'number' ? formatCount(value) : '—'}
                        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                          abonnés
                        </span>
                      </p>
                      <VideoTooltipList videos={videos} />
                    </div>
                  );
                }}
              />
              {videoMarkerLines(rows)}
              {/* `connectNulls` : un jour sans relevé ne doit pas briser la courbe. */}
              <Line
                type="monotone"
                dataKey="followers"
                stroke={FOLLOWERS_COLOR}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};

export const ReachCard = ({ data }: { data: InstagramOverview }) => {
  const privacy = usePrivacy();
  const masked = privacy.isMasked('views');
  const rows = useRows(data, privacy.isMasked('subscribers'), masked);

  const total = masked ? null : data.totals.reach;
  const change = variation(data.totals.reach, data.previousTotals?.reach ?? null);

  const empty = rows.every((row) => row.reach === null);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portée</CardTitle>
        <p className="mt-1 text-2xl font-semibold tabular">
          {total === null ? (masked ? '•••' : '—') : formatCount(total)}
        </p>
        <CardDescription className="text-xs text-muted-foreground">
          {change === null
            ? 'pas de période de comparaison'
            : `${formatPercent(change)} vs période précédente`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {empty ? (
          <p className="flex h-[320px] items-center justify-center text-sm text-muted-foreground">
            Aucun relevé de portée sur cette période.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart
              data={rows}
              syncId={SYNC_ID}
              margin={{ top: 8, right: 8, bottom: 0, left: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" minTickGap={16} {...axisProps} />
              <YAxis width={52} tickFormatter={formatNumberCompact} {...axisProps} />
              <Tooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const value = payload[0]?.value;
                  const videos = (payload[0]?.payload as Row | undefined)?.videos ?? [];
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                      <p className="text-[11px] text-muted-foreground">{label}</p>
                      <p className="text-base font-semibold tabular leading-tight text-popover-foreground">
                        {typeof value === 'number' ? formatCount(value) : '—'}
                        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                          comptes atteints
                        </span>
                      </p>
                      <VideoTooltipList videos={videos} />
                    </div>
                  );
                }}
              />
              {videoMarkerLines(rows)}
              <Bar dataKey="reach" fill={REACH_COLOR} radius={[3, 3, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
