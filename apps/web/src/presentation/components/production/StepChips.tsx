import { Check } from 'lucide-react';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { isStepChecked, progressCounts } from '../../../domain/production/entities/Production.ts';
import type { ProductionStep } from '../../../domain/production/entities/ProductionStep.ts';
import { stepTodoRatio } from '../../../domain/production/entities/StepTodo.ts';
import { cn } from '../../../shared/cn.ts';

interface StepChipsProps {
  production: Production;
  steps: ProductionStep[];
  /** Ouvre la liste des tâches de l'étape. C'est le seul geste : on ne coche plus d'un clic. */
  onOpenStep: (step: ProductionStep) => void;
  /** `sm` pour les cartes de la file, `md` pour l'en-tête de la fiche. */
  size?: 'sm' | 'md';
  disabled?: boolean;
}

/**
 * Les étapes d'une vidéo, avec leur avancement.
 *
 * Cliquer une pastille **ouvre ses tâches** au lieu de cocher l'étape : une étape n'est
 * pas un interrupteur, c'est une liste de choses à faire, et la marquer terminée alors
 * qu'il reste le sound design est exactement ce qui fait perdre le fil. La pastille
 * affiche « 2/5 » dès qu'il y a des tâches — un ratio dit où on en est, une couleur ne
 * dit que fini ou pas fini.
 */
export const StepChips = ({
  production,
  steps,
  onOpenStep,
  size = 'sm',
  disabled,
}: StepChipsProps) => {
  if (steps.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Aucune étape configurée. Ajoute-les dans Paramètres → Étapes.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {steps.map((step) => {
        const checked = isStepChecked(production, step.id);
        const ratio = stepTodoRatio(production.todos, step.id);
        const partial = !checked && ratio !== null && ratio.done > 0;

        return (
          <button
            key={step.id}
            type="button"
            disabled={disabled}
            aria-pressed={checked}
            onClick={(event) => {
              // La carte entière est cliquable (elle ouvre la fiche) : sans ça, ouvrir
              // les tâches ferait aussi naviguer.
              event.preventDefault();
              event.stopPropagation();
              onOpenStep(step);
            }}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border font-medium transition-colors disabled:opacity-50',
              size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
              checked
                ? 'border-transparent text-white'
                : 'border-dashed border-border text-muted-foreground hover:border-solid hover:text-foreground',
              // Commencée mais pas finie : le trait plein la distingue de ce qui n'a
              // pas été touché, sans la faire passer pour terminée.
              partial && 'border-solid border-border text-foreground',
            )}
            style={checked ? { backgroundColor: step.color } : undefined}
            title={
              ratio
                ? `${step.name} — ${ratio.done}/${ratio.total} tâche(s)`
                : `${step.name} — ${checked ? 'fait' : 'à faire'}`
            }
          >
            {checked && <Check className="h-3 w-3" aria-hidden />}
            {step.name}
            {ratio && !checked && (
              <span className="tabular opacity-70">
                {ratio.done}/{ratio.total}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

/**
 * La barre de progression sous les pastilles.
 *
 * Elle compte **les étapes et les tâches du même poids** : une étape à cinq tâches vaut
 * six points. C'est voulu — le travail est dans les tâches, et une barre qui ne
 * compterait que les étapes sauterait de 0 à 20 % sans rien montrer entre les deux.
 */
export const StepProgress = ({
  production,
  steps,
}: {
  production: Production;
  steps: ProductionStep[];
}) => {
  const { done, total } = progressCounts(production, steps.length);
  const ratio = total === 0 ? 0 : done / total;

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--positive)] transition-[width]"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <span className="shrink-0 text-[11px] tabular text-muted-foreground">
        {done}/{total}
      </span>
    </div>
  );
};
