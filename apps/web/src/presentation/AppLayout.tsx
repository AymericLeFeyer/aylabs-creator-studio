import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Moon, Radio, Receipt, Settings, Sun, Tags, Wallet } from 'lucide-react';
import { useTheme } from './hooks/useTheme.ts';
import { Button } from './components/ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './components/ui/dropdown-menu.tsx';
import { FiltersBar } from './components/FiltersBar.tsx';
import { cn } from '../shared/cn.ts';

/** Les écrans de lecture : ceux qui portent la barre de filtres. */
const NAV = [
  { to: '/', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/revenus', label: 'Revenus', icon: Wallet, end: false },
  { to: '/depenses', label: 'Dépenses', icon: Receipt, end: false },
];

/** Les écrans de configuration : rangés dans le menu Paramètres. */
const SETTINGS_NAV = [
  { to: '/chaines', label: 'Chaînes', icon: Radio },
  { to: '/categories', label: 'Catégories', icon: Tags },
];

/**
 * Routes sans barre de filtres : configurer une chaîne ou une catégorie ne dépend
 * ni d'une période ni d'une sélection de chaînes.
 */
const ROUTES_WITHOUT_FILTERS = ['/chaines', '/categories'];

export const AppLayout = () => {
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const showFilters = !ROUTES_WITHOUT_FILTERS.some((route) => location.pathname.startsWith(route));
  const inSettings = !showFilters;

  return (
    <div className="min-h-screen bg-background">
      {/* La barre de filtres vit dans l'en-tête collant : période et chaînes restent
          sous la main quand on descend dans un long tableau. */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <span className="flex items-center gap-2 font-semibold">
            <BarChart3 className="h-5 w-5" />
            Creator Studio
          </span>

          <nav className="flex flex-1 items-center gap-1 overflow-x-auto">
            {NAV.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-secondary text-secondary-foreground'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant={inSettings ? 'secondary' : 'ghost'}
                size="icon"
                title="Paramètres"
                aria-label="Paramètres"
              >
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Paramètres</DropdownMenuLabel>
              {SETTINGS_NAV.map(({ to, label, icon: Icon }) => (
                <DropdownMenuItem
                  key={to}
                  onSelect={() => navigate(to)}
                  className={cn(location.pathname.startsWith(to) && 'bg-secondary')}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="ghost" size="icon" onClick={toggle} title="Changer de thème">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="sr-only">Changer de thème</span>
          </Button>
        </div>

        {showFilters && (
          <div className="border-t border-border">
            <div className="mx-auto max-w-7xl px-4">
              <FiltersBar />
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
};
