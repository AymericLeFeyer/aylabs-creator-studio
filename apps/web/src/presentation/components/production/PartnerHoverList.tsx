import type { ReactNode } from 'react';
import { cn } from '../../../shared/cn.ts';

export interface HoverItem {
  id: string;
  label: string;
  /** Statut, montant… tout ce qui distingue une ligne de l'autre. */
  meta: string;
  /** Met la ligne en avant : produit pas encore reçu, sponso pas encore payée. */
  pending?: boolean;
}

interface PartnerHoverListProps {
  /** Ce qui reste visible en permanence : « 2 produits · 1 en attente ». */
  trigger: ReactNode;
  title: string;
  items: HoverItem[];
}

/**
 * Le détail des produits ou des sponsos d'une vidéo, déplié au survol.
 *
 * Un compteur dit combien, jamais lesquels — et « 2 produits en attente » ne sert à rien
 * si on doit ouvrir la fiche pour savoir de quoi il s'agit. Le panneau donne les noms,
 * les montants et les statuts sans quitter la file d'attente.
 *
 * Même mécanique que le panneau des `StatCard` : du CSS sur `group`, pas de bibliothèque
 * de tooltip. Il s'ouvre aussi au clavier (`group-focus-within`), et `pointer-events-none`
 * l'empêche d'intercepter le clic destiné à la carte en dessous.
 */
export const PartnerHoverList = ({ trigger, title, items }: PartnerHoverListProps) => (
  <span className="group/hover relative inline-flex">
    <span className="flex cursor-help items-center gap-1 underline decoration-dotted underline-offset-2">
      {trigger}
    </span>

    {items.length > 0 && (
      <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-1.5 w-64 max-w-[80vw] rounded-lg border border-border bg-popover p-2.5 text-xs opacity-0 shadow-lg transition-opacity group-focus-within/hover:opacity-100 group-hover/hover:opacity-100">
        <span className="mb-1.5 block font-medium text-muted-foreground">{title}</span>
        <span className="block space-y-1">
          {items.map((item) => (
            <span key={item.id} className="flex items-baseline justify-between gap-2">
              <span className="truncate" title={item.label}>
                {item.label}
              </span>
              <span
                className={cn(
                  'shrink-0 tabular',
                  item.pending ? 'text-[var(--expense)]' : 'text-muted-foreground',
                )}
              >
                {item.meta}
              </span>
            </span>
          ))}
        </span>
      </span>
    )}
  </span>
);
