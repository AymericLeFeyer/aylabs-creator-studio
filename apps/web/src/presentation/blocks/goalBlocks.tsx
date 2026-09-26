import { useState } from 'react';
import {
  BarChart3,
  CircleDot,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Plus,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { useGoals } from '../../application/goal/usecases/useGoals.ts';
import { goalTitle } from '../../domain/goal/entities/Goal.ts';
import { cn } from '../../shared/cn.ts';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { GoalDialog } from '../components/goals/GoalDialog.tsx';
import {
  GoalsBarChart,
  GoalsDonuts,
  GoalsProgressChart,
  GoalsRadialChart,
} from '../components/goals/GoalCharts.tsx';
import { GoalRow } from '../components/goals/GoalRow.tsx';
import { useLocalStorage } from '../hooks/useLocalStorage.ts';
import { BlockHeading } from '../dashboard/BlockHeading.tsx';
import { useWidgetOverrides } from '../dashboard/widgetContext.ts';
import { BlockSkeleton } from './BlockSkeleton.tsx';

/**
 * Les blocs des objectifs (Succès, en tête) : la liste et le graphique commun. La liste
 * porte sa modale **sur Succès seulement** : sur le dashboard, un objectif se regarde, il
 * ne se crée ni ne se modifie (`WidgetContext` non nul = posé sur le dashboard).
 */

/** Le bloc est posé sur le dashboard : lecture seule. */
const useOnDashboard = () => useWidgetOverrides() !== null;

export const GoalsListBlock = () => {
  const { data: goals = [], isLoading } = useGoals();
  const onDashboard = useOnDashboard();
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
          !onDashboard && (
            <Button size="sm" onClick={() => setDialog({ open: true, id: null })}>
              <Plus className="h-4 w-4" />
              Nouvel objectif
            </Button>
          )
        }
      />
      {goals.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <Target className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {onDashboard
              ? 'Aucun objectif pour l’instant : ils se créent depuis Audience → Succès.'
              : 'Aucun objectif pour l’instant : choisis une propriété, une échéance, une cible.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {goals.map((goal) => (
            <GoalRow
              key={goal.id}
              goal={goal}
              onEdit={onDashboard ? undefined : () => setDialog({ open: true, id: goal.id })}
            />
          ))}
        </ul>
      )}
      {!onDashboard && (
        <GoalDialog
          open={dialog.open}
          onOpenChange={(open) => setDialog((current) => ({ ...current, open }))}
          goal={editing}
        />
      )}
    </Card>
  );
};

type ChartMode = 'lines' | 'bars' | 'donuts' | 'radial';

const MODES: Array<{ id: ChartMode; label: string; icon: LucideIcon }> = [
  { id: 'lines', label: 'Courbes', icon: LineChartIcon },
  { id: 'bars', label: 'Barres', icon: BarChart3 },
  { id: 'donuts', label: 'Camemberts', icon: PieChartIcon },
  { id: 'radial', label: 'Anneaux', icon: CircleDot },
];

const DESCRIPTIONS: Record<ChartMode, string> = {
  lines: 'La progression de chaque objectif depuis son départ : 100 % = cible atteinte.',
  bars: 'Où en est chaque objectif aujourd’hui ; la barre grise est le temps écoulé.',
  donuts: 'Un anneau par objectif, le pourcentage atteint au centre.',
  radial: 'Tous les objectifs en anneaux concentriques : touche-en un pour voir sa valeur.',
};

/**
 * Tous les objectifs ensemble, en pourcentage de complétion, sous quatre formes au choix.
 * Le mode est une **préférence de l'appareil** (`acs.goalsChartMode`) : on choisit une
 * lecture et on s'y tient, sur Succès comme sur le dashboard.
 */
export const GoalsChartBlock = () => {
  const { data: goals = [], isLoading } = useGoals();
  const [stored, setMode] = useLocalStorage<ChartMode>('acs.goalsChartMode', 'lines');
  const mode = MODES.some((item) => item.id === stored) ? stored : 'lines';
  // Un objectif pas encore commencé n'a rien à montrer en pourcentage.
  const started = goals.filter((goal) => goal.status !== 'upcoming');

  if (isLoading) return <BlockSkeleton />;
  return (
    <Card className="space-y-3 p-4">
      <BlockHeading
        title="Progression des objectifs"
        description={DESCRIPTIONS[mode]}
        aside={
          <div
            className="flex rounded-md border border-border p-0.5"
            role="group"
            aria-label="Affichage"
          >
            {MODES.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={mode === id}
                onClick={() => setMode(id)}
                className={cn(
                  'rounded p-1.5 transition-colors',
                  mode === id
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>
        }
      />
      {goals.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Ajoute un objectif pour suivre sa progression ici.
        </p>
      ) : mode === 'bars' ? (
        <GoalsBarChart goals={started} />
      ) : mode === 'donuts' ? (
        <GoalsDonuts goals={started} />
      ) : mode === 'radial' ? (
        <GoalsRadialChart goals={started} />
      ) : (
        <>
          <GoalsProgressChart goals={started} />
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {started.map((goal) => (
              <span key={goal.id} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: goal.color }} />
                {goalTitle(goal)}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
};
