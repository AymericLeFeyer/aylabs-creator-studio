import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatMoney } from '../../../shared/format.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card.tsx';

export interface DonutSlice {
  id: string;
  label: string;
  color: string;
  /** Montant en centimes. Toujours positif ici : un anneau ne représente pas un signe. */
  cents: number;
  /** Complément affiché à côté du libellé (« en nature », par exemple). */
  badge?: string;
}

interface DonutBreakdownProps {
  title: string;
  slices: DonutSlice[];
  emptyLabel: string;
  /** Complète le total du centre (« nature comprise »…). */
  totalHint?: string;
}

/**
 * Répartition en anneau, avec le total au centre.
 *
 * L'anneau plutôt que le camembert plein : le trou porte le total, qui est la valeur
 * qu'on lit en premier — et comparer des angles est déjà difficile, autant ne pas
 * demander en plus de comparer des aires depuis un centre occupé.
 *
 * La légende est en HTML sous le graphique, avec la valeur et la part : sur trois
 * anneaux côte à côte, des étiquettes posées sur les tranches se chevaucheraient.
 */
export const DonutBreakdown = ({ title, slices, emptyLabel, totalHint }: DonutBreakdownProps) => {
  const [active, setActive] = useState<string | null>(null);

  const visible = slices.filter((slice) => slice.cents !== 0);
  const total = visible.reduce((sum, slice) => sum + slice.cents, 0);

  if (visible.length === 0 || total === 0) {
    return (
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-1 items-center justify-center">
          <p className="py-8 text-center text-sm text-muted-foreground">{emptyLabel}</p>
        </CardContent>
      </Card>
    );
  }

  const shown = active ? visible.find((slice) => slice.id === active) : undefined;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle>{title}</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="relative mx-auto h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={() => null} cursor={false} />
              <Pie
                data={visible}
                dataKey="cents"
                nameKey="label"
                innerRadius="62%"
                outerRadius="92%"
                paddingAngle={2}
                stroke="var(--color-card)"
                strokeWidth={2}
                isAnimationActive={false}
                onMouseEnter={(_, index) => setActive(visible[index]?.id ?? null)}
                onMouseLeave={() => setActive(null)}
              >
                {visible.map((slice) => (
                  <Cell
                    key={slice.id}
                    fill={slice.color}
                    fillOpacity={active && active !== slice.id ? 0.35 : 1}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>

          {/* Le centre porte le total, ou la tranche survolée : un seul endroit à lire. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="max-w-[8rem] truncate text-[11px] text-muted-foreground">
              {shown ? shown.label : 'Total'}
            </span>
            <span className="text-lg font-semibold tabular leading-tight">
              {formatMoney(shown ? shown.cents : total)}
            </span>
            <span className="text-[11px] text-muted-foreground">
              {shown
                ? `${Math.round((shown.cents / total) * 100)} %`
                : (totalHint ?? `${visible.length} poste${visible.length > 1 ? 's' : ''}`)}
            </span>
          </div>
        </div>

        <ul className="space-y-1 text-xs">
          {visible.map((slice) => (
            <li
              key={slice.id}
              onMouseEnter={() => setActive(slice.id)}
              onMouseLeave={() => setActive(null)}
              className="flex items-center justify-between gap-2 rounded px-1 py-0.5 transition-colors hover:bg-muted/60"
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: slice.color }}
                  aria-hidden
                />
                <span className="truncate text-muted-foreground">{slice.label}</span>
                {slice.badge && (
                  <span className="shrink-0 text-[10px] text-muted-foreground/70">
                    {slice.badge}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular font-medium">{formatMoney(slice.cents)}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
};
