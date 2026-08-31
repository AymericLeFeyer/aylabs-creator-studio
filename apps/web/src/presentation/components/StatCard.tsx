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
}

export const StatCard = ({ label, value, change, hint, icon, accent }: StatCardProps) => {
  const hasChange = change !== undefined && change !== null && Number.isFinite(change);
  const positive = hasChange && change > 0;

  return (
    <Card className="p-4">
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
    </Card>
  );
};
