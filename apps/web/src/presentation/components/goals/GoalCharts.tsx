import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { goalTitle, type GoalView } from '../../../domain/goal/entities/Goal.ts';
import { formatDate } from '../../../shared/format.ts';
import { useGoalValue } from './goalFormat.ts';

/**
 * Les vues de la progression des objectifs, **toutes en pourcentage de complétion** — la
 * seule échelle commune entre des abonnés et des euros, et une échelle qui ne révèle aucune
 * valeur masquée par la confidentialité :
 *
 * - **courbes** : la progression dans le temps, depuis le départ de chaque objectif ;
 * - **barres** : où en est chacun aujourd'hui, face au temps écoulé ;
 * - **camemberts** : un anneau par objectif, le pourcentage au centre ;
 * - **anneaux** : tous les objectifs en cercles concentriques.
 *
 * L'abscisse des courbes est un **temps numérique** et non une catégorie : les séries n'ont
 * pas les mêmes dates.
 */

const toTime = (date: string) => Date.parse(`${date}T00:00:00Z`);
const fromTime = (time: number) => new Date(time).toISOString().slice(0, 10);

const tooltipBox = 'rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md';

const pct = (goal: GoalView, value: number) =>
  goal.targetValue === goal.startValue
    ? 100
    : Math.round(((value - goal.startValue) / (goal.targetValue - goal.startValue)) * 1000) / 10;

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

/** Le pourcentage actuel d'un objectif, planché à zéro : une barre ne descend pas sous l'axe. */
const currentPct = (goal: GoalView) => Math.max(0, Math.round((goal.progress ?? 0) * 1000) / 10);

const EmptyChart = ({ height }: { height: number }) => (
  <p
    className="flex items-center justify-center text-center text-sm text-muted-foreground"
    style={{ height }}
  >
    Aucune mesure encore : les objectifs démarrent à leur date de départ.
  </p>
);

/**
 * Où en est chaque objectif, **aujourd'hui** : deux barres par objectif — la progression
 * dans sa couleur, et le temps écoulé en gris. Une barre de couleur plus longue que la
 * grise, c'est une avance ; plus courte, un retard. Le trait vertical marque 100 %.
 */
export const GoalsBarChart = ({ goals, height = 260 }: { goals: GoalView[]; height?: number }) => {
  if (goals.length === 0) return <EmptyChart height={height} />;
  const rows = goals.map((goal) => ({
    id: goal.id,
    name: goalTitle(goal),
    color: goal.color,
    progress: currentPct(goal),
    elapsed: Math.round(goal.elapsed * 100),
  }));
  const max = Math.max(100, ...rows.map((row) => row.progress));
  return (
    <ResponsiveContainer width="100%" height={Math.max(height, rows.length * 44 + 32)}>
      <BarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 12, bottom: 0, left: 0 }}
        barGap={2}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
        <XAxis
          type="number"
          domain={[0, Math.ceil(max / 10) * 10]}
          tickFormatter={(value: number) => `${value} %`}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
        />
        <YAxis
          type="category"
          dataKey="name"
          width={120}
          tick={{ fontSize: 11 }}
          stroke="var(--muted-foreground)"
          tickFormatter={(value: string) => (value.length > 18 ? `${value.slice(0, 17)}…` : value)}
        />
        <ReferenceLine x={100} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
        <Tooltip
          cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const row = payload[0]!.payload as (typeof rows)[number];
            return (
              <div className={tooltipBox}>
                <p className="mb-1 font-medium">{row.name}</p>
                <p className="tabular">Progression : {row.progress} %</p>
                <p className="tabular text-muted-foreground">Temps écoulé : {row.elapsed} %</p>
              </div>
            );
          }}
        />
        <Bar dataKey="progress" radius={[0, 4, 4, 0]} barSize={14} isAnimationActive={false}>
          {rows.map((row) => (
            <Cell key={row.id} fill={row.color} />
          ))}
        </Bar>
        <Bar
          dataKey="elapsed"
          fill="var(--muted-foreground)"
          fillOpacity={0.35}
          radius={[0, 4, 4, 0]}
          barSize={6}
          isAnimationActive={false}
        />
      </BarChart>
    </ResponsiveContainer>
  );
};

/**
 * Sous l'anneau, la valeur atteinte et la cible (« 2 190 / 3 000 ») : le pourcentage est
 * déjà au centre, c'est le chiffre réel qui manque. `•••` si la métrique est masquée.
 */
const DonutValue = ({ goal }: { goal: GoalView }) => {
  const value = useGoalValue(goal);
  return (
    <p className="text-[11px] tabular text-muted-foreground">
      {value(goal.current)} / {value(goal.targetValue)}
    </p>
  );
};

/**
 * Un anneau par objectif, le pourcentage au centre. La lecture la plus directe de
 * « combien il me reste », une cible à la fois ; au-delà de 100 %, l'anneau est plein.
 */
export const GoalsDonuts = ({ goals }: { goals: GoalView[] }) => {
  if (goals.length === 0) return <EmptyChart height={200} />;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {goals.map((goal) => {
        const value = currentPct(goal);
        const filled = Math.min(100, value);
        return (
          <div key={goal.id} className="flex min-w-0 flex-col items-center gap-1">
            <div className="relative h-28 w-28">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { key: 'done', value: filled },
                      { key: 'left', value: 100 - filled },
                    ]}
                    dataKey="value"
                    innerRadius="72%"
                    outerRadius="100%"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    <Cell fill={goal.color} />
                    <Cell fill="var(--muted)" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <span className="absolute inset-0 flex items-center justify-center text-lg font-semibold tabular">
                {Math.round(value)} %
              </span>
            </div>
            <p className="w-full truncate text-center text-xs font-medium" title={goalTitle(goal)}>
              {goalTitle(goal)}
            </p>
            <DonutValue goal={goal} />
          </div>
        );
      })}
    </div>
  );
};

/**
 * Tous les objectifs en anneaux concentriques, comme les cercles d'activité d'une montre :
 * d'un coup d'œil, lequel est bouclé et lequel traîne. Plafonné à 100 % par anneau.
 */
export const GoalsRadialChart = ({
  goals,
  height = 260,
}: {
  goals: GoalView[];
  height?: number;
}) => {
  if (goals.length === 0) return <EmptyChart height={height} />;
  const rows = goals.map((goal) => ({
    id: goal.id,
    name: goalTitle(goal),
    value: Math.min(100, currentPct(goal)),
    real: currentPct(goal),
    fill: goal.color,
  }));
  return (
    <div className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <ResponsiveContainer width="100%" height={height}>
        <RadialBarChart
          data={rows}
          innerRadius="22%"
          outerRadius="100%"
          startAngle={90}
          endAngle={-270}
          barCategoryGap="18%"
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
          <RadialBar
            dataKey="value"
            background={{ fill: 'var(--muted)' }}
            cornerRadius={8}
            isAnimationActive={false}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0]!.payload as (typeof rows)[number];
              return (
                <div className={tooltipBox}>
                  <p className="font-medium">{row.name}</p>
                  <p className="tabular">{row.real} %</p>
                </div>
              );
            }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <ul className="space-y-1.5 text-xs">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: row.fill }}
            />
            <span className="min-w-0 flex-1 truncate">{row.name}</span>
            <span className="font-semibold tabular">{row.real} %</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
