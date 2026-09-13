import { CalendarCheck, GripVertical } from 'lucide-react';
import {
  formatMinutes,
  todoColor,
  todoMinutes,
  type TodoTask,
} from '../../../domain/planning/entities/Planning.ts';
import { Card } from '../ui/card.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { cn } from '../../../shared/cn.ts';

export interface TodayTodosProps {
  /** Les tâches Todo rangées sous aujourd'hui, en retard comprises. Les faites sont écartées ici. */
  tasks: TodoTask[];
  onToggle: (task: TodoTask, done: boolean) => void;
  /** Même geste que depuis la rangée Todo de la grille : attraper, puis lâcher sur une heure. */
  onPickTask?: (task: TodoTask) => void;
  pendingTaskId?: string | null;
}

/** `2026-09-11` → `11/09`. */
const shortDate = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

/**
 * Le retard d'abord (le plus ancien en tête), puis ce qui a une heure, dans l'ordre de la
 * journée, puis ce qui reste « à caler ». C'est l'ordre dans lequel on s'en occupe.
 */
const rank = (task: TodoTask): string =>
  task.overdue
    ? `0${task.dueDate}`
    : task.placement
      ? `1${task.placement.startTime}`
      : `2${task.title.toLowerCase()}`;

/**
 * « À faire aujourd'hui » : les tâches Todo du jour **pas encore faites**, sous la pile.
 *
 * La rangée Todo de la grille les montre déjà, mais noyées parmi sept colonnes et
 * repliables — et elle disparaît dès que la fenêtre affichée ne contient plus aujourd'hui.
 * Ce panneau répond à une seule question, toujours la même, quelle que soit la date
 * regardée : qu'est-ce qu'il me reste à faire aujourd'hui en dehors des vidéos ?
 *
 * Une tâche cochée quitte la liste : c'est un rappel, pas un journal. Les tâches en retard
 * y figurent (rangées sous aujourd'hui par l'API, comme dans l'app Todo) avec leur date
 * d'origine en rouge.
 */
export const TodayTodos = ({
  tasks,
  onToggle,
  onPickTask,
  pendingTaskId = null,
}: TodayTodosProps) => {
  const open = tasks.filter((task) => !task.done).sort((a, b) => rank(a).localeCompare(rank(b)));
  const total = open.reduce((sum, task) => sum + todoMinutes(task), 0);

  return (
    <Card className="divide-y divide-border">
      <div className="px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <CalendarCheck className="h-4 w-4 text-muted-foreground" aria-hidden />À faire aujourd’hui
          ({open.length})
          {open.length > 0 && (
            <span className="ml-auto text-xs font-normal text-muted-foreground">
              {formatMinutes(total)}
            </span>
          )}
        </p>
        {open.length === 0 && (
          <p className="mt-1 text-xs text-muted-foreground">Tout est fait pour aujourd’hui.</p>
        )}
      </div>

      {open.length > 0 && (
        <div className="py-1">
          {open.map((task) => (
            <div
              key={task.id}
              onPointerDown={() => onPickTask?.(task)}
              className={cn(
                'group flex cursor-grab items-start gap-2 px-3 py-1.5 active:cursor-grabbing',
                task.id === pendingTaskId && 'opacity-40',
              )}
              title="Glisser sur la grille pour lui donner une heure"
            >
              <GripVertical
                className="mt-1 h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-60"
                aria-hidden
              />
              {/* La case neutralise son `pointerdown` : sans ça, cocher démarrerait aussi
                  un glissement vers la grille. */}
              <span onPointerDown={(event) => event.stopPropagation()} className="mt-0.5">
                <Checkbox
                  checked={false}
                  onCheckedChange={(value) => onToggle(task, value === true)}
                  aria-label={`Marquer « ${task.title} » comme faite`}
                />
              </span>
              <span
                className="mt-0.5 h-7 w-1 shrink-0 rounded-full"
                style={{ backgroundColor: todoColor(task) }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{task.title}</p>
                <p className="text-xs text-muted-foreground">
                  {task.placement ? `à ${task.placement.startTime.slice(0, 5)}` : 'à caler'}
                  {' · '}
                  {formatMinutes(todoMinutes(task))}
                  {task.overdue && (
                    <span className="text-[var(--negative)]">
                      {' '}
                      · en retard, prévue le {shortDate(task.dueDate)}
                    </span>
                  )}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
};
