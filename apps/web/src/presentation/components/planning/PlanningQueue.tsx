import { ChevronDown, ChevronUp, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatMinutes, type PlanningItem } from '../../../domain/planning/entities/Planning.ts';
import {
  nowMinutes,
  useRemovePlanningItem,
  useReorderPlanningItems,
} from '../../../application/planning/usecases/usePlanning.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { cn } from '../../../shared/cn.ts';

export interface PlanningQueueProps {
  items: PlanningItem[];
}

/**
 * La pile de ce qui est en cours : le travail qui attend des créneaux.
 *
 * **L'ordre est celui du placement**, et il se règle à la main : le moteur ne devine
 * aucune priorité, et caler le montage avant le tournage remplirait joliment un agenda
 * sans rien permettre de faire. Monter une ligne suffit à faire replanifier tout le
 * reste derrière elle.
 *
 * Chaque ligne dit ce qui est **posé** et ce qui est **déjà fait** : c'est l'écart entre
 * les deux qui indique s'il reste des créneaux à trouver, et un simple total ne le
 * dirait pas.
 */
export const PlanningQueue = ({ items }: PlanningQueueProps) => {
  const reorder = useReorderPlanningItems();
  const remove = useRemovePlanningItem();

  const move = (index: number, direction: -1 | 1) => {
    const next = [...items];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    reorder.mutate({ ids: next.map((item) => item.id), nowMinutes: nowMinutes() });
  };

  if (items.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-sm font-medium">Rien en cours</p>
        <p className="mt-1 text-xs text-muted-foreground">
          « Ajouter une vidéo » met des étapes dans cette pile et leur trouve des créneaux.
        </p>
      </Card>
    );
  }

  return (
    <Card className="divide-y divide-border">
      <div className="px-4 py-2.5">
        <p className="text-sm font-medium">En cours ({items.length})</p>
        <p className="text-xs text-muted-foreground">
          L’ordre décide du placement. Une tâche cochée quitte la pile toute seule.
        </p>
      </div>

      {items.map((item, index) => {
        const remaining = Math.max(0, item.plannedMinutes - item.approvedMinutes);
        const uncovered = Math.max(0, remaining - item.scheduledMinutes);

        return (
          <div key={item.id} className="group flex items-start gap-2 px-3 py-2">
            <span
              className="mt-0.5 h-8 w-1 shrink-0 rounded-full"
              style={{ backgroundColor: item.stepColor ?? item.channelColor ?? '#64748b' }}
              aria-hidden
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{item.label}</p>
              <Link
                to={`/production/${item.productionId}`}
                className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {item.productionTitle}
              </Link>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatMinutes(item.scheduledMinutes)} posées
                {item.approvedMinutes > 0 && ` · ${formatMinutes(item.approvedMinutes)} faites`}
                {uncovered > 0 && (
                  <span className="text-[var(--negative)]">
                    {' '}
                    · {formatMinutes(uncovered)} sans place
                  </span>
                )}
              </p>
            </div>

            <div className="flex shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={index === 0}
                onClick={() => move(index, -1)}
                title="Faire passer avant"
              >
                <ChevronUp className="h-3 w-3" />
                <span className="sr-only">Monter</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                disabled={index === items.length - 1}
                onClick={() => move(index, 1)}
                title="Faire passer après"
              >
                <ChevronDown className="h-3 w-3" />
                <span className="sr-only">Descendre</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className={cn('h-6 w-6')}
                onClick={() => {
                  // Les créneaux déjà posés restent : ils racontent le temps passé, et
                  // les effacer ferait disparaître du travail réellement fait.
                  if (window.confirm(`Retirer « ${item.label} » de la pile ?`)) {
                    remove.mutate(item.id);
                  }
                }}
                title="Retirer de la pile"
              >
                <X className="h-3 w-3 text-destructive" />
                <span className="sr-only">Retirer</span>
              </Button>
            </div>
          </div>
        );
      })}
    </Card>
  );
};
