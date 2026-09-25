import { useMemo } from 'react';
import { Medal } from 'lucide-react';
import { useVisibleAchievements } from '../../application/achievement/usecases/useAchievements.ts';
import type { AchievementTrack } from '../../domain/achievement/entities/Achievement.ts';
import { formatDate } from '../../shared/format.ts';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { Card } from '../components/ui/card.tsx';
import { MilestoneBadge } from '../components/achievements/AchievementTrackCard.tsx';
import {
  formatValue,
  METRIC_MASKS,
  nextMilestone,
  PLATFORM_LABELS,
  reachedMilestones,
} from '../components/achievements/achievementFormat.ts';
import { BlockHeading } from '../dashboard/BlockHeading.tsx';
import { BlockSkeleton } from './BlockSkeleton.tsx';

/**
 * Les blocs des achievements : ce qui se pose sur le dashboard. Les courbes elles-mêmes,
 * une par chaîne et par métrique, restent sur `/achievements` — leur nombre dépend des
 * comptes connectés, et le catalogue des blocs est une liste fixe.
 */

/** Les courbes que la confidentialité laisse voir : un palier révèle un ordre de grandeur. */
const useVisibleTracks = () => {
  const privacy = usePrivacy();
  const { data, isLoading } = useVisibleAchievements();
  const tracks = useMemo(
    () =>
      (data?.tracks ?? []).filter((track) => {
        const mask = METRIC_MASKS[track.metric];
        return mask === null || !privacy.isMasked(mask);
      }),
    [data, privacy],
  );
  return { data, tracks, isLoading };
};

const subtitle = (track: AchievementTrack) =>
  `${PLATFORM_LABELS[track.platform]} · ${track.entityName}`;

export const AchievementsRecentBlock = () => {
  const { tracks, isLoading } = useVisibleTracks();
  const recent = reachedMilestones(tracks).slice(0, 6);
  if (isLoading) return <BlockSkeleton className="h-40" />;
  return (
    <Card className="space-y-3 p-4">
      <BlockHeading
        title="Derniers paliers franchis"
        description="Les plus récents d'abord, toutes plateformes confondues."
      />
      {recent.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Aucun palier daté pour l'instant : ils apparaissent au fil des collectes.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {recent.map(({ track, milestone }) => (
            <div key={`${track.id}:${milestone.threshold}`} className="space-y-0.5">
              <MilestoneBadge
                milestone={milestone}
                color={track.entityColor}
                historyStart={track.historyStart}
                compact
              />
              <p className="truncate px-1 text-[11px] text-muted-foreground">{subtitle(track)}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};

export const AchievementsNextBlock = () => {
  const { tracks, isLoading } = useVisibleTracks();
  // Le plus proche d'abord : c'est celui qu'on peut encore aller chercher ce mois-ci.
  const upcoming = tracks
    .map((track) => ({ track, next: nextMilestone(track) }))
    .filter((row): row is { track: AchievementTrack; next: NonNullable<typeof row.next> } =>
      Boolean(row.next),
    )
    .sort((a, b) => b.next.progress - a.next.progress)
    .slice(0, 6);
  if (isLoading) return <BlockSkeleton className="h-40" />;
  return (
    <Card className="space-y-3 p-4">
      <BlockHeading
        title="Prochains paliers"
        description="Le plus proche d'abord, depuis le palier précédent."
      />
      {upcoming.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Rien à viser : aucune courbe connue, ou tous les paliers sont franchis.
        </p>
      ) : (
        <ul className="space-y-3">
          {upcoming.map(({ track, next }) => (
            <li key={track.id} className="space-y-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium">{next.milestone.title}</span>
                <span className="shrink-0 text-xs tabular text-muted-foreground">
                  {Math.round(next.progress * 100)} %
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round(next.progress * 100)}%`,
                    backgroundColor: track.entityColor,
                  }}
                />
              </div>
              <p className="truncate text-[11px] text-muted-foreground">
                {subtitle(track)} · encore {formatValue(next.remaining, track.unit)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};

export const AchievementsRecordsBlock = () => {
  const privacy = usePrivacy();
  const { data, isLoading } = useVisibleAchievements();
  if (isLoading) return <BlockSkeleton className="h-40" />;
  const records = (data?.records ?? []).filter((record) => {
    const mask = METRIC_MASKS[record.metric];
    return mask === null || !privacy.isMasked(mask);
  });
  return (
    <Card className="space-y-3 p-4">
      <BlockHeading
        title="Records"
        description="Les meilleures journées et les meilleurs contenus."
      />
      {records.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Aucun record pour l'instant.
        </p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {records.map((record) => (
            <div
              key={record.id}
              className="flex min-w-0 items-start gap-2 rounded-lg border border-border p-2.5"
            >
              <Medal className="mt-0.5 h-4 w-4 shrink-0" style={{ color: record.entityColor }} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{record.title}</p>
                {record.value !== null && (
                  <p className="text-lg font-semibold tabular">
                    {formatValue(record.value, record.unit)}
                  </p>
                )}
                {record.detail && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{record.detail}</p>
                )}
                <p className="truncate text-[11px] text-muted-foreground">
                  {PLATFORM_LABELS[record.platform]} · {record.entityName}
                  {record.date && ` · ${formatDate(record.date)}`}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
