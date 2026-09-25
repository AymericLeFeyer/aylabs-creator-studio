import { useMemo } from 'react';
import { Lock, Trophy } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AchievementTrack,
  Milestone,
} from '../../../domain/achievement/entities/Achievement.ts';
import { formatDate } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';
import { readableTextColor } from '../../../shared/contrast.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { Card } from '../ui/card.tsx';
import {
  formatAxis,
  formatValue,
  METRIC_MASKS,
  nextMilestone,
  type NextMilestone,
} from './achievementFormat.ts';

/**
 * Un palier : **débloqué** (sa date, dans la couleur de la chaîne), **déjà acquis avant
 * l'historique** (« avant le … », estompé — on sait qu'il l'est, pas quand) ou
 * **verrouillé** (en creux, et le prochain porte sa barre de progression).
 */
export const MilestoneBadge = ({
  milestone,
  color,
  historyStart,
  next,
  compact = false,
}: {
  milestone: Milestone;
  color: string;
  historyStart: string | null;
  /** Renseigné pour le seul prochain palier : sa progression. */
  next?: NextMilestone | null;
  compact?: boolean;
}) => {
  const reached = Boolean(milestone.reachedAt) || milestone.before;
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-lg border p-2',
        reached ? 'border-transparent' : 'border-dashed border-border',
        milestone.before && 'opacity-70',
      )}
      style={
        reached ? { backgroundColor: `color-mix(in oklab, ${color} 14%, transparent)` } : undefined
      }
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full',
          compact ? 'h-7 w-7' : 'h-8 w-8',
          !reached && 'bg-muted text-muted-foreground',
        )}
        style={reached ? { backgroundColor: color, color: readableTextColor(color) } : undefined}
        aria-hidden
      >
        {reached ? <Trophy className="h-4 w-4" /> : <Lock className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{milestone.title}</span>
        {milestone.reachedAt ? (
          <span className="block text-xs text-muted-foreground">
            {formatDate(milestone.reachedAt)}
          </span>
        ) : milestone.before ? (
          <span className="block text-xs text-muted-foreground">
            {historyStart ? `avant le ${formatDate(historyStart)}` : 'déjà acquis'}
          </span>
        ) : next ? (
          <span className="mt-1 block">
            <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
              <span
                className="block h-full rounded-full"
                style={{ width: `${Math.round(next.progress * 100)}%`, backgroundColor: color }}
              />
            </span>
          </span>
        ) : (
          <span className="block text-xs text-muted-foreground">à venir</span>
        )}
      </span>
    </div>
  );
};

/**
 * Une courbe et ses paliers : la courbe cumulée, un point à chaque palier franchi, la
 * ligne du prochain en pointillés, puis la grille des badges.
 */
export const AchievementTrackCard = ({ track }: { track: AchievementTrack }) => {
  const privacy = usePrivacy();
  const mask = METRIC_MASKS[track.metric];
  const masked = mask !== null && privacy.isMasked(mask);
  const next = nextMilestone(track);
  const scale = track.unit === 'cents' ? 100 : 1;

  const rows = useMemo(
    () => track.series.map((point) => ({ date: point.date, value: point.value / scale })),
    [track.series, scale],
  );
  const valueAt = useMemo(
    () => new Map(track.series.map((point) => [point.date, point.value / scale])),
    [track.series, scale],
  );

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-semibold">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: track.entityColor }}
              aria-hidden
            />
            {track.label}
          </h3>
          <p className="text-xs text-muted-foreground">
            {track.entityName}
            {track.historyStart &&
              ` · ${track.partialHistory ? 'historique depuis' : 'depuis'} le ${formatDate(track.historyStart)}`}
          </p>
        </div>
        {!masked && track.current !== null && (
          <div className="text-right">
            <p className="text-lg font-semibold tabular">
              {formatValue(track.current, track.unit)}
            </p>
            {next && (
              <p className="text-xs text-muted-foreground">
                encore {formatValue(next.remaining, track.unit)} avant « {next.milestone.title} »
              </p>
            )}
          </div>
        )}
      </div>

      {masked ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Masqué par la confidentialité : un palier révèle un ordre de grandeur.
        </p>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`fill-${track.id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={track.entityColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={track.entityColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => formatDate(value)}
                tick={{ fontSize: 11 }}
                stroke="var(--muted-foreground)"
                minTickGap={48}
              />
              <YAxis
                tickFormatter={(value: number) => formatAxis(value * scale, track.unit)}
                tick={{ fontSize: 11 }}
                stroke="var(--muted-foreground)"
                width={56}
              />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  const value = payload[0]?.value;
                  const reachedHere = track.milestones.filter(
                    (milestone) => milestone.reachedAt === label,
                  );
                  return (
                    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
                      <p className="mb-1 text-[11px] text-muted-foreground">
                        {formatDate(String(label))}
                      </p>
                      <p className="font-semibold tabular text-popover-foreground">
                        {typeof value === 'number' ? formatValue(value * scale, track.unit) : '—'}
                      </p>
                      {reachedHere.map((milestone) => (
                        <p key={milestone.threshold} className="mt-1 flex items-center gap-1">
                          <Trophy className="h-3 w-3" style={{ color: track.entityColor }} />
                          {milestone.title}
                        </p>
                      ))}
                    </div>
                  );
                }}
              />
              {next && (
                <ReferenceLine
                  y={next.milestone.threshold / scale}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  ifOverflow="extendDomain"
                />
              )}
              <Area
                type="monotone"
                dataKey="value"
                stroke={track.entityColor}
                strokeWidth={2}
                fill={`url(#fill-${track.id})`}
                dot={false}
              />
              {track.milestones
                .filter((milestone) => milestone.reachedAt)
                .map((milestone) => (
                  <ReferenceDot
                    key={milestone.threshold}
                    x={milestone.reachedAt!}
                    y={valueAt.get(milestone.reachedAt!) ?? milestone.threshold / scale}
                    r={4}
                    fill={track.entityColor}
                    stroke="var(--card)"
                    strokeWidth={2}
                  />
                ))}
            </AreaChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
            {track.milestones
              // Les paliers lointains verrouillés noieraient la grille : on montre
              // tout ce qui est acquis, le prochain, et le suivant pour donner l'horizon.
              .filter((_milestone, index, all) => {
                const firstLocked = all.findIndex((item) => !item.reachedAt && !item.before);
                return firstLocked === -1 || index <= firstLocked + 1;
              })
              .map((milestone) => (
                <MilestoneBadge
                  key={milestone.threshold}
                  milestone={milestone}
                  color={track.entityColor}
                  historyStart={track.historyStart}
                  next={next?.milestone.threshold === milestone.threshold ? next : null}
                />
              ))}
          </div>
        </>
      )}
    </Card>
  );
};
