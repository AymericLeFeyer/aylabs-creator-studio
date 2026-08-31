import type { ReactNode } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { Card } from './ui/card.tsx';
import { formatPercent } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';

interface StatCardProps {
  label: string;
  value: string;
  /** Variation par rapport à la période précédente, `null` si non comparable. */
  change?: number | null;
  hint?: string;
  icon?: ReactNode;
  accent?: string;
  /**
   * Détail déplié au survol : ce que le chiffre agrège. Rendu dans un panneau flottant,
   * pas dans la carte — le tableau de bord doit rester une grille de chiffres lisible
   * d'un coup d'œil, et le détail ne se lit que quand on le cherche.
   */
  details?: ReactNode;
}

export const StatCard = ({ label, value, change, hint, icon, accent, details }: StatCardProps) => {
  const hasChange = change !== undefined && change !== null && Number.isFinite(change);
  const positive = hasChange && change > 0;

  return (
    <Card
      className={cn('group relative p-4', details && 'cursor-help')}
      // Focusable seulement quand il y a quelque chose à déplier : le panneau s'ouvre
      // aussi au clavier, pas uniquement à la souris.
      tabIndex={details ? 0 : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>

      <p
        className="mt-2 text-2xl font-semibold tabular"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>

      <div className="mt-1 flex items-center gap-2">
        {hasChange && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-xs font-medium',
              positive ? 'text-[var(--positive)]' : 'text-[var(--negative)]',
            )}
          >
            {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {formatPercent(change)}
          </span>
        )}
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>

      {details && (
        // Centré sous la carte plutôt qu'aligné à un bord : la même classe convient à
        // la première comme à la dernière colonne de la grille.
        <div className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 w-72 max-w-[90vw] -translate-x-1/2 rounded-lg border border-border bg-popover p-3 text-xs opacity-0 shadow-lg transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {details}
        </div>
      )}
    </Card>
  );
};
