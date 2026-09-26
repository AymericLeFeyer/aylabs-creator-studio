/**
 * Contrat des objectifs, dupliqué de l'API (`apps/api/src/domain/goal/entities/Goal.ts`).
 * Le catalogue des métriques, lui, n'est **pas** dupliqué : il est servi par
 * `/api/goals/catalog`, libellés compris.
 */
export type GoalCategory =
  | 'youtube'
  | 'adsense'
  | 'instagram'
  | 'tiktok'
  | 'discord'
  | 'products'
  | 'sponsorships'
  | 'affiliation'
  | 'amazon'
  | 'domadoo'
  | 'money';

export type GoalEntityKind = 'youtube' | 'instagram' | 'tiktok';

/** `cents` : diviser par 100 à l'affichage, multiplier par 100 à la saisie. */
export type GoalUnit = 'count' | 'cents' | 'hours';

export interface GoalMetricDefinition {
  id: string;
  category: GoalCategory;
  label: string;
  description: string;
  unit: GoalUnit;
  entity: GoalEntityKind | null;
  entityOptional: boolean;
}

export interface GoalEntity {
  id: string;
  name: string;
  color: string;
}

export interface GoalCatalog {
  categories: Array<{ id: GoalCategory; label: string }>;
  metrics: GoalMetricDefinition[];
  entities: Record<GoalEntityKind, GoalEntity[]>;
}

export interface GoalPoint {
  date: string;
  value: number;
}

export type GoalStatus = 'upcoming' | 'achieved' | 'on_track' | 'behind' | 'missed';

export interface Goal {
  id: string;
  title: string;
  metric: string;
  entityId: string | null;
  startDate: string;
  endDate: string;
  /** Dans l'unité de la métrique : des centimes pour de l'argent. */
  startValue: number;
  targetValue: number;
  color: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface GoalView extends Goal {
  category: GoalCategory;
  metricLabel: string;
  unit: GoalUnit;
  entityName: string | null;
  entityColor: string | null;
  current: number | null;
  currentDate: string | null;
  /** Non borné : 1,2 = cible dépassée de 20 %. */
  progress: number | null;
  /** Part du temps écoulé, 0 → 1. */
  elapsed: number;
  achievedAt: string | null;
  status: GoalStatus;
  series: GoalPoint[];
}

export interface GoalInput {
  title?: string;
  metric: string;
  entityId?: string | null;
  startDate: string;
  endDate: string;
  startValue: number;
  targetValue: number;
  color?: string;
}

export interface GoalPreview {
  startValue: number | null;
  current: number | null;
  currentDate: string | null;
  projected: number | null;
  dailyRate: number | null;
}

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  upcoming: 'À venir',
  achieved: 'Atteint',
  on_track: 'En bonne voie',
  behind: 'En retard',
  missed: 'Manqué',
};

/** Le titre libre, sinon « Abonnés · Ma chaîne ». */
export const goalTitle = (goal: GoalView): string =>
  goal.title.trim() ||
  (goal.entityName ? `${goal.metricLabel} · ${goal.entityName}` : goal.metricLabel);
