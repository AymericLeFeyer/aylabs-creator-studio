import { Check } from 'lucide-react';
import type { Production } from '../../../domain/production/entities/Production.ts';
import { isStepChecked } from '../../../domain/production/entities/Production.ts';
import type { ProductionStep } from '../../../domain/production/entities/ProductionStep.ts';
import { cn } from '../../../shared/cn.ts';

interface StepChipsProps {
  production: Production;
  steps: ProductionStep[];
  onToggle: (stepId: string, checked: boolean) => void;
  /** `sm` pour les cartes de la file, `md` pour l'en-tête de la fiche. */
  size?: 'sm' | 'md';
  disabled?: boolean;
}

/**
 * Les étapes d'une vidéo, cochables sur place.
 *
 * Des pastilles côte à côte plutôt qu'une liste verticale : l'avancement se lit d'un
 * seul regard sur une carte de file d'attente, et l'ordre affiché n'impose rien —
 * cocher « miniature » avant « écriture » est parfaitement valable.
 */
export const StepChips = ({
  production,
  steps,
  onToggle,
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
        return (
          <button
            key={step.id}
            type="button"
            disabled={disabled}
            aria-pressed={checked}
            onClick={(event) => {
              // La carte entière est cliquable (elle ouvre la fiche) : sans ça, cocher
              // une étape ferait aussi naviguer.
              event.preventDefault();
              event.stopPropagation();
              onToggle(step.id, !checked);
            }}
            className={cn(
              'inline-flex items-center gap-1 rounded-full border font-medium transition-colors disabled:opacity-50',
              size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
              checked
                ? 'border-transparent text-white'
                : 'border-dashed border-border text-muted-foreground hover:border-solid hover:text-foreground',
            )}
            style={checked ? { backgroundColor: step.color } : undefined}
            title={checked ? `${step.name} — fait` : `${step.name} — à faire`}
          >
            {checked && <Check className="h-3 w-3" aria-hidden />}
            {step.name}
          </button>
        );
      })}
    </div>
  );
};

/** Barre de progression fine, sous les pastilles : « où j'en suis » sans compter. */
export const StepProgress = ({
  production,
  steps,
}: {
  production: Production;
  steps: ProductionStep[];
}) => {
  const done = steps.filter((step) => isStepChecked(production, step.id)).length;
  const ratio = steps.length === 0 ? 0 : done / steps.length;

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--positive)] transition-[width]"
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
      <span className="shrink-0 text-[11px] tabular text-muted-foreground">
        {done}/{steps.length}
      </span>
    </div>
  );
};
