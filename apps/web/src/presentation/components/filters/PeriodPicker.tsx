import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  CALENDAR_PRESETS,
  DEFAULT_CALENDAR,
  DEFAULT_ROLLING,
  PERIOD_LABELS,
  ROLLING_PRESETS,
  useFilters,
  type PeriodPreset,
} from '../../hooks/useFilters.tsx';
import { formatDate } from '../../../shared/format.ts';
import { Input } from '../ui/input.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.tsx';
import { cn } from '../../../shared/cn.ts';

/**
 * Le sélecteur de période, en deux boutons.
 *
 * Sept préréglages alignés prenaient toute une rangée pour un réglage qu'on change
 * rarement. Ils sont désormais rangés en deux familles derrière deux boutons — une
 * **glissante** (30 jours par défaut, 7/90/12 mois dans son menu) et une **calendaire**
 * (Ce mois, puis trimestre/année/tout). Chaque bouton affiche le préréglage actif de sa
 * famille : ce qu'on a choisi reste lisible sans ouvrir le menu.
 *
 * Il n'y a plus de bouton « Personnalisé ». À la place, **la période affichée est
 * elle-même le bouton** : cliquer sur « 5 août – 3 sept. 2026 » ouvre deux champs de
 * date. C'est le geste naturel — on clique sur ce qu'on veut changer —, et ça libère la
 * place d'un bouton qui ne servait qu'à en révéler deux autres.
 */
export const PeriodPicker = () => {
  const filters = useFilters();
  const [editing, setEditing] = useState(false);

  /** Le préréglage actif d'une famille, ou son défaut quand l'autre famille a la main. */
  const activeIn = (family: PeriodPreset[], fallback: PeriodPreset): PeriodPreset =>
    family.includes(filters.preset) ? filters.preset : fallback;

  const rolling = activeIn(ROLLING_PRESETS, DEFAULT_ROLLING);
  const calendar = activeIn(CALENDAR_PRESETS, DEFAULT_CALENDAR);

  /**
   * Passer en dates libres part de la période **actuellement affichée** : on corrige une
   * borne, on ne repart pas d'une saisie vierge.
   */
  const openCustom = () => {
    filters.set({ preset: 'custom', customFrom: filters.from, customTo: filters.to });
    setEditing(true);
  };

  const button = (preset: PeriodPreset, options: PeriodPreset[]) => {
    const active = filters.preset === preset;
    const others = options.filter((option) => option !== preset);

    return (
      <div
        className={cn(
          'flex items-center rounded-md transition-colors',
          active ? 'bg-background shadow' : 'hover:bg-background/60',
        )}
      >
        <button
          type="button"
          onClick={() => {
            filters.set({ preset });
            setEditing(false);
          }}
          className={cn(
            'py-1 pl-2.5 pr-1 text-xs font-medium',
            active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {PERIOD_LABELS[preset]}
        </button>

        {/* La flèche révèle les autres périodes de la même famille : le bouton reste
            celui qu'on utilise, sans cacher les six autres. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="rounded-r-md py-1 pl-0.5 pr-1.5 text-muted-foreground hover:text-foreground"
              aria-label={`Autres périodes (${PERIOD_LABELS[preset]})`}
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {others.map((option) => (
              <DropdownMenuItem
                key={option}
                onSelect={() => {
                  filters.set({ preset: option });
                  setEditing(false);
                }}
                className={cn(filters.preset === option && 'bg-secondary')}
              >
                {PERIOD_LABELS[option]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-lg bg-muted p-1">
        {button(rolling, ROLLING_PRESETS)}
        {button(calendar, CALENDAR_PRESETS)}
      </div>

      {editing ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={filters.customFrom}
            onChange={(event) => filters.set({ customFrom: event.target.value })}
            className="h-8 w-auto text-xs"
            autoFocus
          />
          <span className="text-xs text-muted-foreground">au</span>
          <Input
            type="date"
            value={filters.customTo}
            onChange={(event) => filters.set({ customTo: event.target.value })}
            className="h-8 w-auto text-xs"
          />
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            OK
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openCustom}
          title="Cliquer pour saisir des dates précises"
          className={cn(
            'rounded-md px-1.5 py-1 text-xs tabular transition-colors hover:bg-muted',
            filters.preset === 'custom'
              ? 'font-medium text-foreground'
              : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {formatDate(filters.from)} – {formatDate(filters.to)}
        </button>
      )}
    </div>
  );
};
