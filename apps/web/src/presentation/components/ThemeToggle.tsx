import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTheme, type ThemePreference } from '../hooks/useTheme.ts';
import { cn } from '../../shared/cn.ts';

const OPTIONS: Array<{ value: ThemePreference; label: string; icon: LucideIcon }> = [
  { value: 'system', label: 'Système', icon: Monitor },
  { value: 'light', label: 'Clair', icon: Sun },
  { value: 'dark', label: 'Sombre', icon: Moon },
];

/**
 * Le thème, à trois états : Système (défaut, suit l'OS en direct), Clair, Sombre.
 *
 * **`compact`** (menu replié, icônes seules) n'a pas la largeur pour trois boutons côte à
 * côte : un seul bouton **cycle** les trois états, en affichant l'icône du choix courant
 * — même logique que le bouton de repli du menu, qui change lui aussi de sens selon
 * l'état. **Déplié**, les trois s'affichent en pilule : c'est un choix explicite entre
 * trois options, pas une bascule à deux sens, et le voir d'un coup évite de cliquer à
 * l'aveugle pour retrouver « Système » une fois qu'on l'a quitté.
 */
export const ThemeToggle = ({ compact = false }: { compact?: boolean }) => {
  const { preference, setPreference } = useTheme();

  if (compact) {
    const index = OPTIONS.findIndex((option) => option.value === preference);
    const current = OPTIONS[index]!;
    const next = OPTIONS[(index + 1) % OPTIONS.length]!;
    return (
      <button
        type="button"
        onClick={() => setPreference(next.value)}
        title={`Thème : ${current.label} (clic → ${next.label})`}
        className="flex items-center justify-center rounded-md px-2.5 py-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <current.icon className="h-4 w-4 shrink-0" />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2.5 px-2.5 py-1.5 text-sm font-medium text-muted-foreground">
      <span>Thème</span>
      <div className="ml-auto flex items-center rounded-md border border-border p-0.5">
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setPreference(option.value)}
            title={option.label}
            aria-label={option.label}
            aria-pressed={preference === option.value}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded transition-colors',
              preference === option.value
                ? 'bg-secondary text-secondary-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <option.icon className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
    </div>
  );
};
