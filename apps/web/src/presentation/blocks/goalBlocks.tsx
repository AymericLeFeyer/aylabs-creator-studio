import { useState } from 'react';
import { Plus, Target } from 'lucide-react';
import { useGoals } from '../../application/goal/usecases/useGoals.ts';
import { goalTitle } from '../../domain/goal/entities/Goal.ts';
import { formatDate } from '../../shared/format.ts';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.tsx';
import { GoalDialog } from '../components/goals/GoalDialog.tsx';
import { GoalChart, GoalsProgressChart } from '../components/goals/GoalCharts.tsx';
import { GoalProgressBar, GoalRow, GoalStatusBadge } from '../components/goals/GoalRow.tsx';
import { percent, useGoalValue } from '../components/goals/goalFormat.ts';
import { BlockHeading } from '../dashboard/BlockHeading.tsx';
import { BlockSkeleton } from './BlockSkeleton.tsx';

/**
 * Les blocs des objectifs (Succès, en tête) : la liste, le graphique commun, et un bloc
 * par objectif (`goals.goal.<id>`, reconnu au motif par `resolveBlock`). Chacun porte sa
 * propre modale : posé sur le dashboard, il se gère sans revenir sur Succès.
 */

export const GoalsListBlock = () => {
  const { data: goals = [], isLoading } = useGoals();
  const [dialog, setDialog] = useState<{ open: boolean; id: string | null }>({
    open: false,
    id: null,
  });
  // L'identifiant et non la fiche : après enregistrement la liste est relue, et une fiche
  // figée garderait les anciennes valeurs.
  const editing = goals.find((goal) => goal.id === dialog.id) ?? null;

  if (isLoading) return <BlockSkeleton className="h-40" />;
  return (
    <Card className="space-y-3 p-4">
      <BlockHeading
        title="Objectifs"
        description="La barre avance avec la valeur ; le trait marque le temps écoulé."
        aside={
          <Button size="sm" onClick={() => setDialog({ open: true, id: null })}>
            <Plus className="h-4 w-4" />
            Nouvel objectif
          </Button>
        }
      />
      {goals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Target className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Aucun objectif pour l'instant : choisis une propriété, une échéance, une cible.
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {goals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              onEdit={() => setDialog({ open: true, id: goal.id })}
            />
          ))}
        </ul>
      )}
      <GoalDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
        goal={editing}
      />
    </Card>
  );
};

const ALL = '__all__';

export const GoalsChartBlock = () => {
  const { data: goals = [], isLoading } = useGoals();
  const [selected, setSelected] = useState(ALL);
  const goal = goals.find((item) => item.id === selected) ?? null;

  if (isLoading) return <BlockSkeleton />;
  return (
    <Card className="space-y-3 p-4">
      <BlockHeading
        title="Progression des objectifs"
        description={
          goal
            ? `Du ${formatDate(goal.startDate)} au ${formatDate(goal.endDate)} : la courbe, la cible, la trajectoire idéale en pointillés fins et la prévision.`
            : 'Tous les objectifs en pourcentage de complétion : 100 % = cible atteinte.'
        }
        aside={
          goals.length > 0 && (
            <Select value={goal ? goal.id : ALL} onValueChange={setSelected}>
              <SelectTrigger className="h-8 w-56 max-w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tous les objectifs (%)</SelectItem>
                {goals.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {goalTitle(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />
      {goals.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Ajoute un objectif pour suivre sa progression ici.
        </p>
      ) : goal ? (
        <GoalChart goal={goal} />
      ) : (
        <>
          <GoalsProgressChart goals={goals} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {goals.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => setSelected(item.id)}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                {goalTitle(item)}
              </button>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};

/** Un seul objectif : de quoi le poser en grand sur le dashboard. */
export const GoalBlock = ({ goalId }: { goalId: string }) => {
  const { data: goals, isLoading } = useGoals();
  const [editing, setEditing] = useState(false);
  const goal = goals?.find((item) => item.id === goalId);
  if (isLoading) return <BlockSkeleton />;
  if (!goal) {
    return (
      <Card className="p-4 text-sm text-muted-foreground">
        Cet objectif a été supprimé : retire le bloc du dashboard.
      </Card>
    );
  }
  return <GoalCard goal={goal} editing={editing} setEditing={setEditing} />;
};

const GoalCard = ({
  goal,
  editing,
  setEditing,
}: {
  goal: NonNullable<ReturnType<typeof useGoals>['data']>[number];
  editing: boolean;
  setEditing: (open: boolean) => void;
}) => {
  const value = useGoalValue(goal);
  return (
    <Card className="space-y-3 p-4">
      <BlockHeading
        title={goalTitle(goal)}
        description={[goal.entityName, `jusqu'au ${formatDate(goal.endDate)}`]
          .filter(Boolean)
          .join(' · ')}
        aside={
          <div className="flex items-center gap-2">
            <GoalStatusBadge goal={goal} />
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Modifier
            </Button>
          </div>
        }
      />
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-2xl font-semibold tabular">{percent(goal.progress)}</p>
        <p className="text-right text-xs tabular text-muted-foreground">
          {value(goal.current)} / {value(goal.targetValue)}
          {goal.projected !== null && goal.status !== 'achieved' && (
            <>
              <br />
              prévu {value(goal.projected)}
            </>
          )}
        </p>
      </div>
      <GoalProgressBar goal={goal} />
      <GoalChart goal={goal} height={180} />
      <GoalDialog open={editing} onOpenChange={setEditing} goal={goal} />
    </Card>
  );
};
