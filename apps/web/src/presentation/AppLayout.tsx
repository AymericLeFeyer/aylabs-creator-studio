import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, Moon, Radio, Receipt, Sun, Tags, Wallet } from 'lucide-react';
import { useTheme } from './hooks/useTheme.ts';
import { Button } from './components/ui/button.tsx';
import { cn } from '../shared/cn.ts';

const NAV = [
  { to: '/', label: 'Dashboard', icon: BarChart3, end: true },
  { to: '/revenus', label: 'Revenus', icon: Wallet, end: false },
  { to: '/depenses', label: 'Dépenses', icon: Receipt, end: false },
  { to: '/chaines', label: 'Chaînes', icon: Radio, end: false },
  { to: '/categories', label: 'Catégories', icon: Tags, end: false },
];

export const AppLayout = () => {
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
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

          <Button variant="ghost" size="icon" onClick={toggle} title="Changer de thème">
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="sr-only">Changer de thème</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
};
