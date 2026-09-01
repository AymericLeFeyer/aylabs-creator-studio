import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';

export interface RankingRow {
  id: string;
  label: string;
  color: string;
  /** Valeur qui dessine la barre et se lit à droite. */
  value: number;
  /** Valeur déjà formatée : euros, nombre, peu importe — le composant ne décide pas. */
  formatted: string;
  /** Complément discret sous le libellé (« 3 produits », « 2 sponsos »). */
  hint?: string;
}

interface RankingBarsProps {
  title: string;
  description?: string;
  rows: RankingRow[];
  emptyLabel: string;
  /** Au-delà, ce n'est plus un classement mais un tableau. */
  limit?: number;
}

/**
 * Classement en barres horizontales.
 *
 * Des barres plutôt qu'un anneau : sur un top-N ordonné, ce qui se lit est le **rang**
 * et l'écart entre le premier et les suivants — deux choses qu'une longueur donne
 * immédiatement et qu'un angle rend difficiles. Les anneaux du dashboard gardent leur
 * rôle : montrer une répartition dont la somme fait un tout.
 *
 * Les barres sont proportionnelles au maximum de la liste, pas au total : un classement
 * n'est pas une répartition, et rapporter au total écraserait tout le bas de liste.
 */
export const RankingBars = ({
  title,
  description,
  rows,
  emptyLabel,
  limit = 6,
}: RankingBarsProps) => {
  const visible = rows
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

  const max = Math.max(...visible.map((row) => row.value), 1);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </CardHeader>

      <CardContent className="flex-1">
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ol className="space-y-2.5">
            {visible.map((row, index) => (
              <li key={row.id} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span className="w-4 shrink-0 tabular text-xs text-muted-foreground">
                      {index + 1}
                    </span>
                    <span className="truncate font-medium" title={row.label}>
                      {row.label}
                    </span>
                    {row.hint && (
                      <span className="shrink-0 text-xs text-muted-foreground">{row.hint}</span>
                    )}
                  </span>
                  <span className="shrink-0 tabular font-semibold">{row.formatted}</span>
                </div>
                <div className="ml-6 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.max(2, (row.value / max) * 100)}%`,
                      backgroundColor: row.color,
                    }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
};
