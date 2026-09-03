import { useMemo, useState } from 'react';
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
import { useLegalOverview } from '../../../application/legal/usecases/useLegal.ts';
import {
  pastMonths,
  pastQuarters,
  pastYears,
  type CalendarPeriod,
} from '../../../domain/analytics/services/calendarPeriods.ts';
import { formatDate } from '../../../shared/format.ts';
import { Input } from '../ui/input.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu.tsx';
import { cn } from '../../../shared/cn.ts';

/**
 * Le sélecteur de période, en deux boutons.
 *
 * Sept préréglages alignés prenaient toute une rangée pour un réglage qu'on change
 * rarement. Ils sont désormais rangés en deux familles derrière deux boutons — une
 * **glissante** (30 jours par défaut, 7/90/12 mois dans son menu) et une **calendaire**
 * (Ce mois, puis les mois clos, les trimestres, les années). Chaque bouton affiche la
 * période active de sa famille : ce qu'on a choisi reste lisible sans ouvrir le menu.
 *
 * Il n'y a plus de bouton « Personnalisé ». À la place, **la période affichée est
 * elle-même le bouton** : cliquer sur « 5 août – 3 sept. 2026 » ouvre deux champs de
 * date. C'est le geste naturel — on clique sur ce qu'on veut changer.
 */
export const PeriodPicker = () => {
  const filters = useFilters();
  const [editing, setEditing] = useState(false);

  // La date de création de la société borne la liste des années : proposer 2019 à
  // quelqu'un qui a démarré en 2024 ferait quatre lignes qui ne renverront rien.
  const { data: legal } = useLegalOverview();
  const foundedOn = legal?.company?.foundedOn ?? null;

  const calendar = useMemo(() => {
    const today = new Date();
    return {
      months: pastMonths(today),
      quarters: pastQuarters(today),
      years: pastYears(today, foundedOn),
    };
  }, [foundedOn]);

  /** Le préréglage actif d'une famille, ou son défaut quand l'autre famille a la main. */
  const activeIn = (family: PeriodPreset[], fallback: PeriodPreset): PeriodPreset =>
    family.includes(filters.preset) ? filters.preset : fallback;

  const rolling = activeIn(ROLLING_PRESETS, DEFAULT_ROLLING);
  const calendarPreset = activeIn(CALENDAR_PRESETS, DEFAULT_CALENDAR);

  /** Une période nommée est active : son nom remplace celui du préréglage. */
  const namedPeriod = filters.preset === 'custom' ? filters.customLabel : null;

  /**
   * Passer en dates libres part de la période **actuellement affichée** : on corrige une
   * borne, on ne repart pas d'une saisie vierge. Le nom tombe — deux dates éditées à la
   * main ne sont plus « Août 2026 ».
   */
  const openCustom = () => {
    filters.set({
      preset: 'custom',
      customFrom: filters.from,
      customTo: filters.to,
      customLabel: null,
    });
    setEditing(true);
  };

  const selectPreset = (preset: PeriodPreset) => {
    filters.set({ preset, customLabel: null });
    setEditing(false);
  };

  const selectPeriod = (period: CalendarPeriod) => {
    filters.set({
      preset: 'custom',
      customFrom: period.from,
      customTo: period.to,
      customLabel: period.label,
    });
    setEditing(false);
  };

  /** Une entrée du menu calendaire est active si ses bornes sont celles affichées. */
  const isActivePeriod = (period: CalendarPeriod): boolean =>
    filters.preset === 'custom' && filters.from === period.from && filters.to === period.to;

  const periodItems = (periods: CalendarPeriod[]) =>
    periods.map((period) => (
      <DropdownMenuItem
        key={period.id}
        onSelect={() => selectPeriod(period)}
        className={cn(isActivePeriod(period) && 'bg-secondary')}
      >
        {period.label}
      </DropdownMenuItem>
    ));

  const presetItem = (preset: PeriodPreset) => (
    <DropdownMenuItem
      key={preset}
      onSelect={() => selectPreset(preset)}
      className={cn(filters.preset === preset && 'bg-secondary')}
    >
      {PERIOD_LABELS[preset]}
    </DropdownMenuItem>
  );

  /**
   * Le menu calendaire : chaque préréglage suivi des périodes closes de sa maille.
   *
   * L'ordre suit la façon dont on cherche — « ce mois », sinon un mois précis, sinon on
   * élargit au trimestre, puis à l'année. Les séparateurs marquent ces trois mailles :
   * sans eux, vingt lignes de dates se lisent comme une seule liste.
   */
  const calendarMenu = (
    <>
      {presetItem('mtd')}
      {periodItems(calendar.months)}

      <DropdownMenuSeparator />
      {presetItem('qtd')}
      {periodItems(calendar.quarters)}

      <DropdownMenuSeparator />
      {presetItem('ytd')}
      {periodItems(calendar.years)}

      <DropdownMenuSeparator />
      {presetItem('all')}
    </>
  );

  const button = (
    label: string,
    active: boolean,
    onSelect: () => void,
    menu: React.ReactNode,
    menuLabel: string,
  ) => (
    <div
      className={cn(
        'flex items-center rounded-md transition-colors',
        active ? 'bg-background shadow' : 'hover:bg-background/60',
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          'py-1 pl-2.5 pr-1 text-xs font-medium',
          active ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        {label}
      </button>

      {/* La flèche révèle les autres périodes de la même famille : le bouton reste
          celui qu'on utilise, sans cacher les autres. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="rounded-r-md py-1 pl-0.5 pr-1.5 text-muted-foreground hover:text-foreground"
            aria-label={menuLabel}
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        {/* La liste des années peut être longue : elle défile plutôt que de dépasser
            de l'écran. */}
        <DropdownMenuContent align="start" className="max-h-[70vh] overflow-y-auto">
          {menu}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-0.5 rounded-lg bg-muted p-1">
        {button(
          PERIOD_LABELS[rolling],
          filters.preset === rolling,
          () => selectPreset(rolling),
          ROLLING_PRESETS.filter((preset) => preset !== rolling).map(presetItem),
          `Autres périodes glissantes (${PERIOD_LABELS[rolling]})`,
        )}

        {button(
          // Un mois ou un trimestre choisi dans la liste prend la place du préréglage :
          // c'est bien la famille calendaire qui a la main, autant le montrer.
          namedPeriod ?? PERIOD_LABELS[calendarPreset],
          filters.preset === calendarPreset || namedPeriod !== null,
          () => selectPreset(calendarPreset),
          calendarMenu,
          'Autres périodes calendaires',
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={filters.customFrom}
            onChange={(event) => filters.set({ customFrom: event.target.value, customLabel: null })}
            className="h-8 w-auto text-xs"
            autoFocus
          />
          <span className="text-xs text-muted-foreground">au</span>
          <Input
            type="date"
            value={filters.customTo}
            onChange={(event) => filters.set({ customTo: event.target.value, customLabel: null })}
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
