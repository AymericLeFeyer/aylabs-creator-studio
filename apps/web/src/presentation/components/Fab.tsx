import type { LucideIcon } from 'lucide-react';
import { cn } from '../../shared/cn.ts';

interface FabProps {
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  className?: string;
}

/**
 * Le bouton d'action flottant, **mobile uniquement**.
 *
 * Sur un écran large, l'action principale vit dans l'en-tête de la page, à côté du titre :
 * elle y est lisible et ne recouvre rien. Sur mobile ce même bouton mangeait une ligne
 * entière en haut de l'écran, poussant sous le pli ce qu'on était venu regarder — et il
 * était de toute façon hors de portée du pouce.
 *
 * Il se pose **au-dessus de la barre du bas** (`--bottom-nav`, qui porte déjà la zone de
 * sécurité iOS) : sans ça il recouvrirait l'onglet de droite, c'est-à-dire exactement la
 * cible qu'on vise en revenant.
 *
 * Le libellé n'est pas affiché mais reste dans `aria-label` **et** en infobulle : une
 * icône seule ne dit pas ce qu'elle fait, et un lecteur d'écran n'a rien à lire dans un
 * `+`.
 */
export const Fab = ({ label, icon: Icon, onClick, className }: FabProps) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className={cn(
      'fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full',
      'bg-primary text-primary-foreground shadow-lg transition-transform active:scale-95 lg:hidden',
      className,
    )}
    style={{ bottom: 'calc(var(--bottom-nav) + 1rem)' }}
  >
    <Icon className="h-6 w-6" />
  </button>
);
