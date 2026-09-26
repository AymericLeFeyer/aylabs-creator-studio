import {
  findGoalMetric,
  GOAL_CATEGORIES,
  GOAL_METRICS,
  type Goal,
  type GoalCatalog,
  type GoalEntity,
  type GoalInput,
  type GoalMetricDefinition,
  type GoalMetricId,
  type GoalPreview,
  type GoalStatus,
  type GoalUpdate,
  type GoalView,
} from '../../../domain/goal/entities/Goal.ts';
import type { GoalRepository } from '../../../domain/goal/repositories/GoalRepository.ts';
import type { GoalSourceRepository } from '../../../domain/goal/repositories/GoalSourceRepository.ts';
import {
  achievedAt,
  dailySeries,
  daysBetween,
  lastPointAt,
  progressOf,
  projectAt,
  toCurve,
  valueAt,
} from '../../../domain/goal/services/goalMath.ts';
import { badRequest } from '../../../shared/errors.ts';
import { today as serverToday } from '../../../shared/dates.ts';

/**
 * Les objectifs : le CRUD, la lecture enrichie (valeur actuelle, progression, série) et
 * l'aperçu du formulaire — seul endroit où vit la prévision : elle sert à choisir une
 * cible, pas à juger l'objectif une fois posé. `today` vient du navigateur quand il est fourni — le
 * serveur est en UTC, et un objectif qui se termine « aujourd'hui » à 23 h à Paris ne doit
 * pas passer pour échu.
 */
export class ManageGoals {
  private readonly goals: GoalRepository;
  private readonly source: GoalSourceRepository;

  constructor(goals: GoalRepository, source: GoalSourceRepository) {
    this.goals = goals;
    this.source = source;
  }

  catalog(): GoalCatalog {
    return { categories: GOAL_CATEGORIES, metrics: GOAL_METRICS, entities: this.source.entities() };
  }

  list(today = serverToday()): GoalView[] {
    const entities = this.source.entities();
    return this.goals.findAll().map((goal) => this.view(goal, today, entities));
  }

  get(id: string, today = serverToday()): GoalView {
    return this.view(this.goals.findById(id), today, this.source.entities());
  }

  preview(input: {
    metric: GoalMetricId;
    entityId: string | null;
    startDate: string;
    endDate: string | null;
    today?: string;
  }): GoalPreview {
    const today = input.today ?? serverToday();
    this.assertMetric(input.metric, input.entityId);
    const curve = toCurve(this.source.series(input.metric, input.entityId));
    const last = lastPointAt(curve, today);
    const { projected, rate } =
      input.endDate && input.endDate > input.startDate
        ? projectAt(curve, today, input.endDate)
        : { projected: null, rate: null };
    return {
      startValue: valueAt(curve, input.startDate),
      current: last?.value ?? (curve.kind === 'flux' ? 0 : null),
      currentDate: last?.date ?? null,
      projected,
      dailyRate: rate,
    };
  }

  create(input: GoalInput, today = serverToday()): GoalView {
    this.assertInput(input.metric, input.entityId ?? null, input.startDate, input.endDate);
    return this.get(this.goals.create(input).id, today);
  }

  update(id: string, input: GoalUpdate, today = serverToday()): GoalView {
    const current = this.goals.findById(id);
    this.assertInput(
      input.metric ?? current.metric,
      input.entityId === undefined ? current.entityId : input.entityId,
      input.startDate ?? current.startDate,
      input.endDate ?? current.endDate,
    );
    this.goals.update(id, input);
    return this.get(id, today);
  }

  delete(id: string): void {
    this.goals.delete(id);
  }

  reorder(ids: string[], today = serverToday()): GoalView[] {
    this.goals.reorder(ids);
    return this.list(today);
  }

  private assertMetric(metricId: string, entityId: string | null): GoalMetricDefinition {
    const metric = findGoalMetric(metricId);
    if (!metric) throw badRequest('Métrique inconnue');
    if (metric.entity === null && entityId) {
      throw badRequest('Cette métrique ne se rattache à aucune chaîne ni aucun compte');
    }
    if (metric.entity !== null && !metric.entityOptional && !entityId) {
      throw badRequest('Choisis la chaîne ou le compte suivi');
    }
    return metric;
  }

  private assertInput(metricId: string, entityId: string | null, start: string, end: string) {
    this.assertMetric(metricId, entityId);
    if (end <= start) throw badRequest("L'échéance doit suivre la date de départ");
  }

  private view(
    goal: Goal,
    today: string,
    entities: ReturnType<GoalSourceRepository['entities']>,
  ): GoalView {
    const metric = findGoalMetric(goal.metric)!;
    const entity: GoalEntity | null =
      metric.entity && goal.entityId
        ? (entities[metric.entity].find((item) => item.id === goal.entityId) ?? null)
        : null;
    const curve = toCurve(this.source.series(goal.metric, goal.entityId));

    // Tout se lit jusqu'à l'échéance au plus tard : un objectif clos ne bouge plus.
    const horizon = goal.endDate < today ? goal.endDate : today;
    const started = goal.startDate <= today;
    const last = started ? lastPointAt(curve, horizon) : null;
    const current = started ? valueAt(curve, horizon) : null;
    const progress =
      current === null ? null : progressOf(current, goal.startValue, goal.targetValue);
    const total = daysBetween(goal.startDate, goal.endDate);
    const elapsed = total > 0 ? clamp(daysBetween(goal.startDate, today) / total) : 1;
    const reached = started
      ? achievedAt(curve, goal.startDate, horizon, goal.startValue, goal.targetValue)
      : null;

    let status: GoalStatus;
    if (!started) status = 'upcoming';
    else if (reached) status = 'achieved';
    else if (goal.endDate < today) status = 'missed';
    else status = (progress ?? 0) >= elapsed ? 'on_track' : 'behind';

    return {
      ...goal,
      category: metric.category,
      metricLabel: metric.label,
      unit: metric.unit,
      entityName: entity?.name ?? (metric.entity && !goal.entityId ? 'Toutes les chaînes' : null),
      entityColor: entity?.color ?? null,
      current,
      currentDate: last?.date ?? null,
      progress,
      elapsed,
      achievedAt: reached,
      status,
      series: started ? dailySeries(curve, goal.startDate, horizon) : [],
    };
  }
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));
