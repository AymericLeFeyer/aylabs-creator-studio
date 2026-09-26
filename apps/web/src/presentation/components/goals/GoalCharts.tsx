import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { goalTitle, type GoalView } from '../../../domain/goal/entities/Goal.ts';
import { formatDate } from '../../../shared/format.ts';
import { localToday } from '../../../application/planning/usecases/usePlanning.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { formatGoalAxis, formatGoalValue, goalMask } from './goalFormat.ts';

/**
 * Les deux lectures d'un objectif en graphique :
 * - **tous ensemble**, en pourcentage de complétion — la seule échelle commune entre des
 *   abonnés et des euros ;
 * - **un seul**, dans son unité, avec la cible, la trajectoire idéale (départ → cible à
 *   l'échéance) et la prévision au rythme récent.
 *
 * L'abscisse est un **temps numérique** et non une catégorie : les séries n'ont pas les
 * mêmes dates, et l'échéance doit tomber à sa place même quand aucun point n'y est.
 */

const DAY_MS = 86_400_000;
const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromTime = (time: number) => new Date(time).toISOString().slice(0, 10);

const tooltipBox = 'rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md';

const pct = (goal: GoalView, value: number) =>
  goal.targetValue === goal.startValue
    ? 100
    : Math.round(((value - goal.startValue) / (goal.targetValue - goal.startValue)) * 1000) / 10;

/** La valeur à tracer : dans l'unité affichée (euros), ou en % quand elle est masquée. */
const readValue = (goal: GoalView, value: number, masked: boolean) =>
  masked ? pct(goal, value) : value / (goal.unit === 'cents' ? 100 : 1);

/** Tous les objectifs en pourcentage de complétion. */
export const GoalsProgressChart = ({
  goals,
  height = 260,
}: {
  goals: GoalView[];
  height?: number;
}) => {
  const rows = useMemo(() => {
    const byTime = new Map<number, Record<string, number>>();
    for (const goal of goals) {
      for (const point of goal.series) {
        const time = toTime(point.date);
        const row = byTime.get(time) ?? { time };
        row[goal.id] = pct(goal, point.value);
        byTime.set(time, row);
      }
    }
    return [...byTime.values()].sort((a, b) => a.time! - b.time!);
  }, [goals]);

  if (rows.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        Aucune mesure encore : la courbe démarre à la date de départ des objectifs.
      </p>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={['dataMin', 'dataMax']}
          tickFormatter={(time: number) => formatDate(fromTime(time))}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          minTickGap={48}
        />
        <YAxis
          tickFormatter={(value: number) => `${value} %`}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          width={48}
        />
        <ReferenceLine y={100} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            return (
              <div className={tooltipBox}>
                <p className="mb-1 text-[11px] text-muted-foreground">
                  {formatDate(fromTime(Number(label)))}
                </p>
                {payload.map((entry) => {
                  const goal = goals.find((item) => item.id === entry.dataKey);
                  if (!goal) return null;
                  return (
                    <p key={goal.id} className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: goal.color }}
                      />
                      <span className="min-w-0 truncate">{goalTitle(goal)}</span>
                      <span className="ml-auto pl-2 font-semibold tabular">{entry.value} %</span>
                    </p>
                  );
                })}
              </div>
            );
          }}
        />
        {goals.map((goal) => (
          <Line
            key={goal.id}
            type="monotone"
            dataKey={goal.id}
            name={goalTitle(goal)}
            stroke={goal.color}
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
};

/** Réel, trajectoire idéale et prévision, sur un axe de temps commun. */
const buildGoalRows = (goal: GoalView, masked: boolean) => {
  const read = (value: number) => readValue(goal, value, masked);
  const start = toTime(goal.startDate);
  const end = toTime(goal.endDate);
  const map = new Map<number, Record<string, number | null>>();
  const at = (time: number) => {
    const row = map.get(time) ?? { time };
    map.set(time, row);
    return row;
  };
  for (const point of goal.series) at(toTime(point.date)).value = read(point.value);
  // Trajectoire idéale : une droite du départ à la cible.
  at(start).ideal = read(goal.startValue);
  at(end).ideal = read(goal.targetValue);
  // Prévision : de la dernière mesure à l'échéance, si l'échéance est encore devant.
  const last = goal.series.at(-1);
  const today = localToday();
  if (last && goal.projected !== null && goal.endDate > today) {
    at(toTime(last.date)).forecast = read(last.value);
    at(end).forecast = read(goal.projected);
  }
  return [...map.values()].sort((a, b) => a.time! - b.time!);
};

/**
 * Un objectif dans son unité : la courbe réelle, la cible, la trajectoire idéale et la
 * prévision. Masqué par la confidentialité, il retombe sur le pourcentage — qui ne dit
 * rien d'une valeur absolue tant que la cible ne s'affiche pas.
 */
export const GoalChart = ({ goal, height = 240 }: { goal: GoalView; height?: number }) => {
  const privacy = usePrivacy();
  const mask = goalMask(goal.metric);
  const masked = mask !== null && privacy.isMasked(mask);
  const scale = goal.unit === 'cents' ? 100 : 1;
  const read = (value: number) => readValue(goal, value, masked);

  const rows = buildGoalRows(goal, masked);

  const format = (value: number) =>
    masked ? `${value} %` : formatGoalValue(value * scale, goal.unit);
  const today = toTime(localToday());
  const showToday = today > toTime(goal.startDate) && today < toTime(goal.endDate);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={`goal-fill-${goal.id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={goal.color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={goal.color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="time"
          type="number"
          scale="time"
          domain={[toTime(goal.startDate), toTime(goal.endDate) + DAY_MS / 2]}
          tickFormatter={(time: number) => formatDate(fromTime(time))}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          minTickGap={48}
        />
        <YAxis
          tickFormatter={(value: number) =>
            masked ? `${value} %` : formatGoalAxis(value * scale, goal.unit)
          }
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          width={56}
          domain={['auto', 'auto']}
        />
        <ReferenceLine
          y={read(goal.targetValue)}
          stroke={goal.color}
          strokeDasharray="4 4"
          ifOverflow="extendDomain"
          label={{
            value: 'Cible',
            position: 'insideTopLeft',
            fontSize: 11,
            fill: 'var(--muted-foreground)',
          }}
        />
        {showToday && (
          <ReferenceLine x={today} stroke="var(--today, var(--muted-foreground))" strokeWidth={1} />
        )}
        <Tooltip
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]?.payload as Record<string, number | undefined>;
            return (
              <div className={tooltipBox}>
                <p className="mb-1 text-[11px] text-muted-foreground">
                  {formatDate(fromTime(Number(label)))}
                </p>
                {row.value !== undefined && (
                  <p className="font-semibold tabular">{format(row.value)}</p>
                )}
                {row.forecast !== undefined && row.value === undefined && (
                  <p className="tabular">Prévision : {format(row.forecast)}</p>
                )}
                {row.ideal !== undefined && row.value === undefined && (
                  <p className="tabular text-muted-foreground">Cible : {format(row.ideal)}</p>
                )}
              </div>
            );
          }}
        />
        <Line
          dataKey="ideal"
          stroke="var(--muted-foreground)"
          strokeDasharray="2 4"
          strokeWidth={1}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          dataKey="forecast"
          stroke={goal.color}
          strokeDasharray="6 4"
          strokeWidth={1.5}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Area
          type="monotone"
          dataKey="value"
          stroke={goal.color}
          strokeWidth={2}
          fill={`url(#goal-fill-${goal.id})`}
          dot={false}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};
