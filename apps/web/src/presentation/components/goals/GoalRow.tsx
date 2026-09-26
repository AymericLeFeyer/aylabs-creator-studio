import { Pencil } from 'lucide-react';
import {
  GOAL_STATUS_LABELS,
  goalTitle,
  type GoalView,
} from '../../../domain/goal/entities/Goal.ts';
import { cn } from '../../../shared/cn.ts';
import { formatDate } from '../../../shared/format.ts';
import { percent, STATUS_TONES, useGoalValue } from './goalFormat.ts';

export const GoalStatusBadge = ({ goal }: { goal: GoalView }) => (
  <span
    className={cn(
      'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium',
      STATUS_TONES[goal.status],
    )}
  >
    {GOAL_STATUS_LABELS[goal.status]}
  </span>
);

/**
 * La barre de progression, et un **repère du temps écoulé** : la barre devant le trait, on
 * est en avance ; derrière, en retard. C'est ce qui dit d'un coup d'œil si 40 % est bien.
 */
export const GoalProgressBar = ({ goal }: { goal: GoalView }) => {
  const width = Math.min(1, Math.max(0, goal.progress ?? 0));
  const showElapsed = goal.status !== 'upcoming' && goal.status !== 'achieved' && goal.elapsed < 1;
  return (
    <div className="relative h-2 rounded-full bg-muted">
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${width * 100}%`, backgroundColor: goal.color }}
      />
      {showElapsed && (
        <span
          className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-foreground/60"
          style={{ left: `calc(${goal.elapsed * 100}% - 1px)` }}
          title={`${Math.round(goal.elapsed * 100)} % du temps écoulé`}
        />
      )}
    </div>
  );
};

/** Une ligne de la liste des objectifs. */
export const GoalRow = ({
  goal,
  onEdit,
  onSelect,
  selected = false,
}: {
  goal: GoalView;
  onEdit?: () => void;
  onSelect?: () => void;
  selected?: boolean;
}) => {
  const value = useGoalValue(goal);
  const subtitle = [goal.entityName, `jusqu'au ${formatDate(goal.endDate)}`]
    .filter(Boolean)
    .join(' · ');
  return (
    <li
      className={cn(
        'group space-y-1.5 rounded-lg border border-transparent p-2 transition-colors',
        onSelect && 'cursor-pointer hover:bg-muted/60',
        selected && 'border-border bg-muted/60',
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: goal.color }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{goalTitle(goal)}</span>
        <GoalStatusBadge goal={goal} />
        <span className="w-12 shrink-0 text-right text-xs font-semibold tabular">
          {percent(goal.progress)}
        </span>
        {onEdit && (
          <button
            type="button"
            className="shrink-0 rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:text-foreground group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              onEdit();
            }}
            aria-label="Modifier l'objectif"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <GoalProgressBar goal={goal} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">{subtitle}</span>
        <span className="tabular">
          {value(goal.current)} / {value(goal.targetValue)}
          {goal.achievedAt && ` · atteint le ${formatDate(goal.achievedAt)}`}
        </span>
      </div>
    </li>
  );
};
