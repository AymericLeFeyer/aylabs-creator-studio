import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  BarChart3,
  Clapperboard,
  Handshake,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PlaySquare,
  ScrollText,
  Settings,
  Sun,
  Wallet,
  X,
} from 'lucide-react';
import { useTheme } from './hooks/useTheme.ts';
import { usePreferences } from './hooks/usePreferences.ts';
import { Button } from './components/ui/button.tsx';
import { FiltersBar } from './components/FiltersBar.tsx';
import { RunningTimerBar } from './components/production/RunningTimerBar.tsx';
import { cn } from '../shared/cn.ts';

/** Largeur du contenu, généreuse sur grand écran : les graphiques côte à côte en ont besoin. */
const CONTAINER = 'mx-auto w-full max-w-[1800px] px-3 sm:px-5';

/** Les écrans de travail, dans l'ordre où une journée les traverse. */
const NAV = [
  { to: '/', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/contenu', label: 'Contenu', icon: PlaySquare, end: false },
  { to: '/production', label: 'Production', icon: Clapperboard, end: false },
  { to: '/partenariats', label: 'Partenariats', icon: Handshake, end: false },
  { to: '/chiffre-affaires', label: "Chiffre d'affaires", icon: Wallet, end: false },
  { to: '/legal', label: 'Légal', icon: ScrollText, end: false },
];

/**
 * Routes sans barre de filtres : configurer une chaîne ou une catégorie ne dépend ni
 * d'une période ni d'une sélection de chaînes. Le module de production non plus — une
 * vidéo à écrire n'appartient à aucune fenêtre de temps —, et le tableau légal a sa
 * propre maille, le mois.
 */
const ROUTES_WITHOUT_FILTERS = ['/parametres', '/production', '/partenariats', '/legal'];

/** Largeurs de la barre latérale. Repliée, elle ne montre que les icônes. */
const SIDEBAR_OPEN = '15rem';
const SIDEBAR_CLOSED = '3.75rem';

/**
 * La coquille de l'application : navigation à gauche, contenu à droite.
 *
 * La barre latérale remplace l'ancienne rangée d'onglets horizontale. Trois raisons :
 * la liste des écrans peut grandir sans se disputer la largeur avec la barre de
 * filtres ; l'écran actif se repère à sa position plutôt qu'à sa couleur ; et sur mobile
 * la même barre devient un tiroir, au lieu d'une rangée qui défile horizontalement.
 *
 * **Repliée, elle ne montre que les icônes** — le libellé revient en infobulle. L'état
 * est une préférence persistée : on choisit une fois, l'outil s'en souvient.
 *
 * Les paramètres et le thème sont **en bas**, séparés du reste : on n'y va pas dans le
 * fil du travail, et les mettre en tête ferait descendre les écrans qu'on ouvre
 * réellement chaque jour.
 */
export const AppLayout = () => {
  const { theme, toggle } = useTheme();
  const { preferences, set } = usePreferences();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  const collapsed = preferences.sidebarCollapsed;
  const showFilters = !ROUTES_WITHOUT_FILTERS.some((route) => location.pathname.startsWith(route));

  // Naviguer referme le tiroir : sur mobile, il recouvre le contenu qu'on vient
  // d'ouvrir. Dérivé pendant le rendu plutôt que dans un effet — même pattern que les
  // formulaires du projet, et une navigation ne doit pas coûter un rendu de plus.
  const [lastPath, setLastPath] = useState(location.pathname);
  if (lastPath !== location.pathname) {
    setLastPath(location.pathname);
    setMobileOpen(false);
  }

  const navLink = (
    { to, label, icon: Icon, end }: (typeof NAV)[number],
    { compact }: { compact: boolean },
  ) => (
    <NavLink
      key={to}
      to={to}
      end={end}
      title={compact ? label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
          compact && 'justify-center px-0',
          isActive
            ? 'bg-secondary text-secondary-foreground'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!compact && <span className="truncate">{label}</span>}
    </NavLink>
  );

  /** Le contenu de la barre, identique en colonne fixe et en tiroir mobile. */
  const sidebarContent = ({ compact }: { compact: boolean }) => (
    <div className="flex h-full flex-col gap-1 p-2">
      <div className={cn('flex items-center gap-2 px-1 py-2', compact && 'justify-center px-0')}>
        <BarChart3 className="h-5 w-5 shrink-0" />
        {!compact && <span className="truncate font-semibold">Creator Studio</span>}
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {NAV.map((item) => navLink(item, { compact }))}
      </nav>

      {/* Le pied : ce qui se règle une fois, hors du fil du travail. */}
      <div className="flex flex-col gap-0.5 border-t border-border pt-2">
        <NavLink
          to="/parametres"
          title={compact ? 'Paramètres' : undefined}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
              compact && 'justify-center px-0',
              isActive
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )
          }
        >
          <Settings className="h-4 w-4 shrink-0" />
          {!compact && <span>Paramètres</span>}
        </NavLink>

        <button
          type="button"
          onClick={toggle}
          title="Changer de thème"
          className={cn(
            'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
            compact && 'justify-center px-0',
          )}
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 shrink-0" />
          ) : (
            <Moon className="h-4 w-4 shrink-0" />
          )}
          {!compact && <span>{theme === 'dark' ? 'Thème clair' : 'Thème sombre'}</span>}
        </button>

        {/* Le repli ne s'offre qu'en colonne fixe : dans un tiroir, il n'aurait pas de sens. */}
        <button
          type="button"
          onClick={() => set({ sidebarCollapsed: !collapsed })}
          title={collapsed ? 'Déplier le menu' : 'Replier le menu'}
          className={cn(
            'hidden items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:flex',
            compact && 'justify-center px-0',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-4 w-4 shrink-0" />
          ) : (
            <PanelLeftClose className="h-4 w-4 shrink-0" />
          )}
          {!compact && <span>Replier</span>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Colonne fixe, à partir de `lg` seulement. */}
      <aside
        className="fixed inset-y-0 left-0 z-40 hidden border-r border-border bg-card transition-[width] lg:block"
        style={{ width: collapsed ? SIDEBAR_CLOSED : SIDEBAR_OPEN }}
      >
        {sidebarContent({ compact: collapsed })}
      </aside>

      {/* Tiroir mobile : même barre, posée par-dessus le contenu. */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-60 border-r border-border bg-card lg:hidden">
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1"
              onClick={() => setMobileOpen(false)}
              aria-label="Fermer le menu"
            >
              <X className="h-4 w-4" />
            </Button>
            {sidebarContent({ compact: false })}
          </aside>
        </>
      )}

      <div
        className="transition-[padding] lg:pl-[var(--sidebar-width)]"
        style={{ ['--sidebar-width' as string]: collapsed ? SIDEBAR_CLOSED : SIDEBAR_OPEN }}
      >
        <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
          <div className={cn(CONTAINER, 'flex items-center gap-2 pt-2 lg:pt-0')}>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Ouvrir le menu"
            >
              <Menu className="h-4 w-4" />
            </Button>

            {/* La barre de filtres occupe l'en-tête : période et chaînes restent sous la
                main quand on descend dans un long tableau. */}
            <div className="min-w-0 flex-1">
              {showFilters ? <FiltersBar /> : <div className="h-2" />}
            </div>
          </div>

          {/* Le chronomètre vit DANS l'en-tête collant : il suit l'écran et non la page —
              on le démarre sur la production et on l'arrête souvent depuis ailleurs. L'y
              poser plutôt que de lui donner son propre `sticky` évite de le désaligner
              dès que la barre de filtres change de hauteur. */}
          <RunningTimerBar />
        </header>

        <main className={cn(CONTAINER, 'py-4 sm:py-6')}>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
