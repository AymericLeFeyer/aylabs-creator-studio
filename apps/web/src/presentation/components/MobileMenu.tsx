import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, Monitor, Moon, Settings, Sun, X, type LucideIcon } from 'lucide-react';
import type { NavItem, NavSection } from '../navigation.ts';
import { sumBadges, type NavBadge } from '../navBadges.ts';
import { cn } from '../../shared/cn.ts';
import { Button } from './ui/button.tsx';
import { NavBadgePill } from './NavBadgePill.tsx';
import { useTheme, type ThemePreference } from '../hooks/useTheme.ts';

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
  sections: NavSection[];
  badges: Record<string, NavBadge>;
  isItemActive: (to: string, isActive: boolean) => boolean;
  collapsedSections: string[];
  onToggleSection: (label: string) => void;
  logoUrl: string;
  appName: string;
}

const THEME_OPTIONS: Array<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: 'system', label: 'Auto', icon: Monitor },
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
];

/**
 * Le menu sur mobile : **une page entière de tuiles**, et non la barre latérale posée en
 * tiroir. Une liste verticale de quinze lignes de 36 px se vise mal au pouce et se lit en
 * faisant défiler ; des tuiles de trois par rangée tiennent sur un écran, se touchent sans
 * viser, et gardent l'icône — ce qu'on reconnaît avant le libellé.
 *
 * **Toujours monté**, pour que l'ouverture et la fermeture s'animent : un tiroir qui
 * glisse depuis la gauche, et des tuiles qui apparaissent l'une après l'autre. Fermé, il
 * est `inert` et `invisible` (la visibilité ne bascule qu'en fin de transition), donc hors
 * du clavier et des lecteurs d'écran.
 *
 * Les familles se replient comme dans la barre latérale, avec **la même préférence** :
 * une famille repliée sur l'ordinateur l'est aussi ici, et sa pastille fait la somme de
 * celles qu'elle cache.
 */
export const MobileMenu = ({
  open,
  onClose,
  sections,
  badges,
  isItemActive,
  collapsedSections,
  onToggleSection,
  logoUrl,
  appName,
}: MobileMenuProps) => {
  const { preference, setPreference } = useTheme();
  // `Échap` referme, et la page dessous ne défile pas pendant que le menu la couvre.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  // Un rang global, pour échelonner l'apparition des tuiles sur tout l'écran.
  const order = new Map(
    sections.flatMap((section) => section.items).map((item, index) => [item.to, index]),
  );
  const tile = (item: NavItem) => {
    const delay = open ? 60 + (order.get(item.to) ?? order.size) * 18 : 0;
    const Icon = item.icon;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.end}
        onClick={onClose}
        style={{ transitionDelay: `${delay}ms` }}
        className={({ isActive }) =>
          cn(
            'relative flex min-h-[5.25rem] flex-col items-center justify-center gap-1.5 rounded-2xl border px-1.5 py-3 text-center text-xs font-medium',
            'transition-[opacity,transform,background-color] duration-300 ease-out active:scale-95 motion-reduce:transition-none',
            open ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
            isItemActive(item.to, isActive)
              ? 'border-primary/40 bg-secondary text-secondary-foreground'
              : 'border-border bg-card text-foreground',
          )
        }
      >
        <Icon className="h-6 w-6" />
        <span className="line-clamp-2 leading-tight">{item.label}</span>
        <NavBadgePill badge={badges[item.to]} className="absolute right-1.5 top-1.5" />
      </NavLink>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Menu"
      aria-hidden={!open}
      inert={!open}
      className={cn(
        'fixed inset-0 z-50 flex flex-col bg-background lg:hidden',
        'transition-[transform,visibility] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none',
        open ? 'visible translate-x-0' : 'invisible -translate-x-full',
      )}
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <NavLink to="/" end onClick={onClose} className="flex min-w-0 flex-1 items-center gap-2">
          <img src={logoUrl} alt="" className="h-7 w-7 shrink-0 object-contain" />
          <span className="truncate text-base font-semibold">{appName}</span>
        </NavLink>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer le menu">
          <X className="h-5 w-5" />
        </Button>
      </div>

      <nav
        aria-label="Navigation principale"
        className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 py-4"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}
      >
        {sections.map((section) => {
          const collapsed = section.label !== null && collapsedSections.includes(section.label);
          return (
            <section key={section.label ?? 'top'} className="space-y-2">
              {section.label && (
                <button
                  type="button"
                  onClick={() => onToggleSection(section.label!)}
                  aria-expanded={!collapsed}
                  className="flex w-full items-center gap-2 px-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase"
                >
                  <span>{section.label}</span>
                  {collapsed && (
                    <NavBadgePill
                      badge={sumBadges(
                        badges,
                        section.items.map((item) => item.to),
                      )}
                    />
                  )}
                  <ChevronDown
                    className={cn(
                      'ml-auto h-4 w-4 transition-transform duration-200',
                      collapsed && '-rotate-90',
                    )}
                  />
                </button>
              )}
              {!collapsed && (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {section.items.map(tile)}
                </div>
              )}
            </section>
          );
        })}

        <section className="grid grid-cols-3 gap-2 border-t border-border pt-4 sm:grid-cols-4">
          {tile({ to: '/parametres', label: 'Paramètres', icon: Settings, end: false })}
          {/* Le thème dans la grammaire des tuiles : une tuile large, trois choix. */}
          <div
            role="group"
            aria-label="Thème"
            style={{ transitionDelay: `${open ? 60 + (order.size + 1) * 18 : 0}ms` }}
            className={cn(
              'col-span-2 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-1',
              'transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none',
              open ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0',
            )}
          >
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => setPreference(value)}
                aria-pressed={preference === value}
                className={cn(
                  'flex flex-col items-center justify-center gap-1.5 rounded-xl text-xs font-medium transition-colors active:scale-95',
                  preference === value
                    ? 'bg-secondary text-secondary-foreground'
                    : 'text-muted-foreground',
                )}
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </div>
        </section>
      </nav>
    </div>
  );
};
