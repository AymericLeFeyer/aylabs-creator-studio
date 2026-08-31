import type { CategoryBreakdownItem } from '../../../domain/analytics/entities/Analytics.ts';
import { NATURE_LABELS } from '../../../domain/category/entities/Category.ts';
import { formatMoney } from '../../../shared/format.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';
import { Badge } from '../ui/badge.tsx';

interface CategoryBreakdownProps {
  title: string;
  items: CategoryBreakdownItem[];
  /** Texte affiché quand la période ne contient rien. */
  emptyLabel: string;
  /** Complète la ligne de total (« avantages en nature compris », par exemple). */
  totalHint?: string;
}

/**
 * Répartition par catégorie sur la période, côté revenus ou côté dépenses.
 *
 * Les barres sont proportionnelles au plus gros poste plutôt qu'au total : avec une
 * catégorie dominante, un rapport au total écraserait toutes les autres à quelques pixels.
 */
export const CategoryBreakdown = ({
  title,
  items,
  emptyLabel,
  totalHint,
}: CategoryBreakdownProps) => {
  const visible = items.filter((item) => item.totalCents !== 0);

  if (visible.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        </CardContent>
      </Card>
    );
  }

  const max = Math.max(...visible.map((item) => Math.abs(item.totalCents)));
  const grandTotal = visible.reduce((sum, item) => sum + item.totalCents, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {formatMoney(grandTotal)} sur la période{totalHint ? `, ${totalHint}` : ''}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {visible.map((item) => (
          <div key={item.categoryId}>
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden
                />
                {item.categoryName}
                {item.nature === 'in_kind' && (
                  <Badge variant="inKind">{NATURE_LABELS.in_kind}</Badge>
                )}
              </span>
              <span className="tabular font-medium">{formatMoney(item.totalCents)}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(Math.abs(item.totalCents) / max) * 100}%`,
                  backgroundColor: item.color,
                }}
              />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
