import type {
  AchievementMetric,
  AchievementPlatform,
  AchievementTrack,
  AchievementUnit,
  Milestone,
} from '../../../domain/achievement/entities/Achievement.ts';
import type { PrivacyTarget } from '../../hooks/usePrivacy.tsx';
import {
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatNumberCompact,
} from '../../../shared/format.ts';

/**
 * Ce qui se partage entre les blocs et l'écran des achievements. Ce fichier n'exporte
 * aucun composant (`react-refresh/only-export-components`).
 */

export const PLATFORM_LABELS: Record<AchievementPlatform, string> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

export const PLATFORMS: AchievementPlatform[] = ['youtube', 'instagram', 'tiktok'];

/**
 * La clé de confidentialité qui couvre une métrique. Un palier **révèle un ordre de
 * grandeur** (« 10 000 abonnés ») : une métrique masquée masque aussi ses paliers, ses
 * records et sa courbe. Compter des vidéos ou des stories ne dit rien de confidentiel.
 */
export const METRIC_MASKS: Record<AchievementMetric, PrivacyTarget | null> = {
  subscribers: 'subscribers',
  followers: 'subscribers',
  views: 'views',
  hearts: 'views',
  adsense: 'adsense',
  videos: null,
  posts: null,
  stories: null,
};

export const formatValue = (value: number, unit: AchievementUnit): string =>
  unit === 'cents' ? formatMoney(value) : formatNumber(value);

export const formatAxis = (value: number, unit: AchievementUnit): string =>
  unit === 'cents' ? formatMoneyCompact(value) : formatNumberCompact(value);

export interface NextMilestone {
  milestone: Milestone;
  /** Entre 0 et 1 : où en est la courbe entre le palier précédent et celui-ci. */
  progress: number;
  remaining: number;
}

/** Le prochain palier d'une courbe, et le chemin parcouru depuis le précédent. */
export const nextMilestone = (track: AchievementTrack): NextMilestone | null => {
  const index = track.milestones.findIndex(
    (milestone) => !milestone.reachedAt && !milestone.before,
  );
  if (index === -1 || track.current === null) return null;
  const milestone = track.milestones[index]!;
  const floor = index > 0 ? track.milestones[index - 1]!.threshold : 0;
  const span = milestone.threshold - floor;
  return {
    milestone,
    progress: span > 0 ? Math.min(1, Math.max(0, (track.current - floor) / span)) : 0,
    remaining: Math.max(0, milestone.threshold - track.current),
  };
};

/** Un palier daté, avec la courbe qui le porte : l'unité des listes transverses. */
export interface ReachedMilestone {
  track: AchievementTrack;
  milestone: Milestone & { reachedAt: string };
}

export const reachedMilestones = (tracks: AchievementTrack[]): ReachedMilestone[] =>
  tracks
    .flatMap((track) =>
      track.milestones
        .filter((milestone): milestone is Milestone & { reachedAt: string } =>
          Boolean(milestone.reachedAt),
        )
        .map((milestone) => ({ track, milestone })),
    )
    .sort((a, b) => b.milestone.reachedAt.localeCompare(a.milestone.reachedAt));
