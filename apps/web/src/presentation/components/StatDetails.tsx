import type { ReactNode } from 'react';
import { cn } from '../../shared/cn.ts';

/**
 * Le contenu des panneaux de survol des `StatCard` : **ce qui fait que le chiffre est ce
 * qu'il est**. Un titre, des lignes (une composante, un élément de liste), un total, une
 * note — toujours la même grammaire, pour que tous les panneaux se lisent pareil.
 *
 * Règle commune à tous les panneaux : ils ne montrent que ce que la carte agrège — mêmes
 * bornes, mêmes chaînes, même confidentialité. Un détail qui ne retombe pas sur le chiffre
 * juste au-dessus ferait douter des deux.
 */
export interface DetailRow {
  key: string;
  label: ReactNode;
  /** Déjà formaté (et masqué) par l'appelant. */
  value?: ReactNode;
  /** Pastille de couleur avant le libellé (catégorie, chaîne, statut). */
  color?: string;
  /** Petite ligne sous le libellé : date, marque, raison. */
  sub?: ReactNode;
  /** `+` / `−` / `=` en marge : une ligne de calcul plutôt qu'un élément de liste. */
  operator?: '+' | '−' | '=';
  /** Grisé : une composante hors du total (produits reçus non comptés, par exemple). */
  muted?: boolean;
  /** Mis en avant : en retard, à relancer. */
  tone?: 'danger' | 'warning';
}

const TONES = {
  danger: 'text-[var(--negative)]',
  warning: 'text-[var(--expense)]',
} as const;

export const StatDetails = ({
  title,
  rows = [],
  total,
  note,
  empty,
  max = 6,
  children,
}: {
  title?: ReactNode;
  rows?: DetailRow[];
  /** Ligne de total, séparée par un filet. */
  total?: { label: ReactNode; value: ReactNode };
  /** Explication en gris, en bas : d'où vient le chiffre, ce qu'il ne compte pas. */
  note?: ReactNode;
  /** Affiché à la place des lignes quand il n'y en a aucune. */
  empty?: ReactNode;
  /** Au-delà, le panneau dépasserait l'écran : le reste est compté sur une ligne. */
  max?: number;
  children?: ReactNode;
}) => {
  const shown = rows.slice(0, max);
  const hidden = rows.length - shown.length;

  return (
    <div className="space-y-2 text-left">
      {title && <p className="font-medium text-popover-foreground">{title}</p>}

      {rows.length === 0 && empty ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        rows.length > 0 && (
          <ul className="space-y-1">
            {shown.map((row) => (
              <li
                key={row.key}
                className={cn(
                  'flex items-baseline gap-2',
                  row.muted && 'opacity-50',
                  row.operator === '=' && 'border-t border-border pt-1 font-medium',
                )}
              >
                {row.operator && (
                  <span className="w-3 shrink-0 text-center text-muted-foreground">
                    {row.operator}
                  </span>
                )}
                {row.color && (
                  <span
                    className="mt-1 h-2 w-2 shrink-0 self-start rounded-full"
                    style={{ backgroundColor: row.color }}
                    aria-hidden
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      'line-clamp-1 text-popover-foreground',
                      row.tone && TONES[row.tone],
                    )}
                  >
                    {row.label}
                  </span>
                  {row.sub && (
                    <span className="line-clamp-1 text-[11px] text-muted-foreground">
                      {row.sub}
                    </span>
                  )}
                </span>
                {row.value !== undefined && (
                  <span className={cn('shrink-0 tabular', row.tone && TONES[row.tone])}>
                    {row.value}
                  </span>
                )}
              </li>
            ))}
            {hidden > 0 && <li className="text-muted-foreground">et {hidden} de plus…</li>}
          </ul>
        )
      )}

      {children}

      {total && (
        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-1 font-medium">
          <span className="text-muted-foreground">{total.label}</span>
          <span className="tabular">{total.value}</span>
        </div>
      )}

      {note && <p className="text-muted-foreground">{note}</p>}
    </div>
  );
};
