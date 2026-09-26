import type { GoalPoint } from '../entities/Goal.ts';
import type { RawGoalSeries } from '../repositories/GoalSourceRepository.ts';
import { addDays, parseIsoDate } from '../../../shared/dates.ts';

/**
 * Le calcul des objectifs, sans accès aux dépôts : une série brute → une courbe cumulée
 * qu'on sait lire à n'importe quel jour, et dont on tire départ, progression et prévision.
 */

/** Une courbe cumulée, un point par jour de relevé, dans l'ordre. */
export interface GoalCurve {
  kind: 'level' | 'flux';
  points: GoalPoint[];
}

/** Au-delà de ce nombre de jours, la série renvoyée passe à un point par semaine. */
const MAX_DAILY_POINTS = 540;

/** La fenêtre du rythme retenu par la prévision. */
export const PROJECTION_WINDOW_DAYS = 90;

export const daysBetween = (from: string, to: string): number =>
  Math.round((parseIsoDate(to).getTime() - parseIsoDate(from).getTime()) / 86_400_000);

export const toCurve = (raw: RawGoalSeries): GoalCurve => {
  const byDate = new Map<string, number>();
  for (const point of raw.points) {
    if (!Number.isFinite(point.value)) continue;
    // Un flux s'additionne dans la journée ; un relevé cumulé garde le dernier.
    byDate.set(
      point.date,
      raw.kind === 'flux' ? (byDate.get(point.date) ?? 0) + point.value : point.value,
    );
  }
  const dates = [...byDate.keys()].sort();
  let running = 0;
  const points = dates.map((date) => {
    const value = byDate.get(date)!;
    if (raw.kind === 'level') return { date, value };
    running += value;
    return { date, value: running };
  });
  return { kind: raw.kind, points };
};

/**
 * La valeur de la courbe à un jour : le dernier point connu jusqu'à lui. Avant le premier
 * point, un flux vaut zéro (rien n'avait encore été gagné) ; un relevé ne sait pas.
 */
export const valueAt = (curve: GoalCurve, date: string): number | null => {
  let low = 0;
  let high = curve.points.length - 1;
  let found: GoalPoint | null = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const point = curve.points[mid]!;
    if (point.date <= date) {
      found = point;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (found) return found.value;
  return curve.kind === 'flux' ? 0 : null;
};

/** Le dernier relevé jusqu'à `date` : la valeur « actuelle » et le jour qui la porte. */
export const lastPointAt = (curve: GoalCurve, date: string): GoalPoint | null =>
  curve.points.findLast((point) => point.date <= date) ?? null;

/**
 * Un point par jour de `from` à `to` (les jours sans valeur connue sont omis), ou un par
 * semaine au-delà de `MAX_DAILY_POINTS` — la dernière date est toujours présente.
 */
export const dailySeries = (curve: GoalCurve, from: string, to: string): GoalPoint[] => {
  const span = daysBetween(from, to);
  if (span < 0) return [];
  const step = span > MAX_DAILY_POINTS ? 7 : 1;
  const series: GoalPoint[] = [];
  for (let offset = 0; offset <= span; offset += step) {
    const date = addDays(from, offset);
    const value = valueAt(curve, date);
    if (value !== null) series.push({ date, value });
  }
  if (span % step !== 0) {
    const value = valueAt(curve, to);
    if (value !== null) series.push({ date: to, value });
  }
  return series;
};

/**
 * Le rythme par jour sur les `PROJECTION_WINDOW_DAYS` derniers jours : la pente des
 * moindres carrés sur la série quotidienne. Une droite ajustée plutôt que « dernier moins
 * premier » : un relevé isolé en bord de fenêtre ne décide pas seul de la prévision.
 * `null` sous une semaine d'historique — une prévision tirée de trois jours dirait
 * n'importe quoi.
 */
export const dailyRate = (curve: GoalCurve, today: string): number | null => {
  if (curve.points.length === 0) return null;
  const first = curve.points[0]!.date;
  const windowStart = addDays(today, -PROJECTION_WINDOW_DAYS);
  const from = first > windowStart ? first : windowStart;
  const series = dailySeries(curve, from, today);
  if (series.length < 7) return null;
  const n = series.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (const point of series) {
    const x = daysBetween(from, point.date);
    sumX += x;
    sumY += point.value;
    sumXY += x * point.value;
    sumXX += x * x;
  }
  const denominator = n * sumXX - sumX * sumX;
  return denominator === 0 ? null : (n * sumXY - sumX * sumY) / denominator;
};

/**
 * La valeur attendue à `endDate` : la valeur d'aujourd'hui prolongée au rythme récent.
 * Une échéance déjà passée n'a rien à prévoir, c'est sa valeur réelle.
 */
export const projectAt = (
  curve: GoalCurve,
  today: string,
  endDate: string,
): { projected: number | null; rate: number | null } => {
  if (endDate <= today) return { projected: valueAt(curve, endDate), rate: null };
  const current = valueAt(curve, today);
  const rate = dailyRate(curve, today);
  if (current === null || rate === null) return { projected: current, rate };
  return { projected: current + rate * daysBetween(today, endDate), rate };
};

/** `(valeur − départ) / (cible − départ)` — dans le sens de l'objectif, même à la baisse. */
export const progressOf = (value: number, start: number, target: number): number | null =>
  target === start ? (value === target ? 1 : null) : (value - start) / (target - start);

/** Le premier jour où la cible est atteinte, entre `from` et `to`. */
export const achievedAt = (
  curve: GoalCurve,
  from: string,
  to: string,
  start: number,
  target: number,
): string | null => {
  const upward = target >= start;
  const reached = (value: number) => (upward ? value >= target : value <= target);
  // Un relevé cumulé antérieur au départ peut déjà porter la cible.
  const atStart = valueAt(curve, from);
  if (atStart !== null && reached(atStart)) return from;
  for (const point of curve.points) {
    if (point.date < from || point.date > to) continue;
    if (reached(point.value)) return point.date;
  }
  return null;
};
