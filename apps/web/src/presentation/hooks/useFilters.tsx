import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { subDays, subMonths, subYears, startOfMonth, startOfQuarter, startOfYear } from 'date-fns';
import { useLocalStorage } from './useLocalStorage.ts';
import { toIsoDate } from '../../shared/format.ts';
import type { Granularity } from '../../domain/analytics/entities/Analytics.ts';
import type { MoneyMode } from '../../domain/analytics/services/revenueMath.ts';

export type PeriodPreset = '7d' | '30d' | '90d' | '12m' | 'mtd' | 'qtd' | 'ytd' | 'all' | 'custom';

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  '7d': '7 jours',
  '30d': '30 jours',
  '90d': '90 jours',
  '12m': '12 mois',
  mtd: 'Ce mois',
  qtd: 'Ce trimestre',
  ytd: 'Cette année',
  all: 'Tout',
  custom: 'Personnalisé',
};

/**
 * Les deux familles de périodes, telles que le sélecteur les présente.
 *
 * **Glissantes** : une fenêtre de N jours qui se termine aujourd'hui — « comment ça va
 * en ce moment ». **Calendaires** : un mois, un trimestre, une année qui commencent à
 * leur premier jour — « où j'en suis sur la période comptable ». Les deux répondent à
 * des questions différentes, d'où deux boutons plutôt qu'une liste unique de sept.
 */
export const ROLLING_PRESETS: PeriodPreset[] = ['7d', '30d', '90d', '12m'];
export const CALENDAR_PRESETS: PeriodPreset[] = ['mtd', 'qtd', 'ytd', 'all'];

/** Le préréglage mis en avant dans chaque famille : celui qu'on choisit neuf fois sur dix. */
export const DEFAULT_ROLLING: PeriodPreset = '30d';
export const DEFAULT_CALENDAR: PeriodPreset = 'mtd';

/** Granularité par défaut d'un préréglage : un an en jours serait illisible. */
const DEFAULT_GRANULARITY: Record<PeriodPreset, Granularity> = {
  '7d': 'day',
  '30d': 'day',
  '90d': 'week',
  '12m': 'month',
  mtd: 'day',
  qtd: 'week',
  ytd: 'month',
  all: 'month',
  custom: 'day',
};

interface FiltersState {
  preset: PeriodPreset;
  /** Utilisés seulement quand `preset` vaut `custom`. */
  customFrom: string;
  customTo: string;
  /**
   * Nom de la période choisie dans le menu calendaire (« Août 2026 », « T2 2026 »).
   *
   * `null` quand les dates ont été saisies à la main : le bouton affiche alors les
   * bornes, faute de nom à donner. C'est ce champ qui distingue un mois clos choisi dans
   * la liste d'une plage libre — les deux sont des `custom`, mais l'un a un nom.
   */
  customLabel: string | null;
  granularity: Granularity | 'auto';
  channelIds: string[];
  includeUnassigned: boolean;
  moneyMode: MoneyMode;
  includeInKind: boolean;
  /** Trait vertical à chaque sortie de vidéo sur le graphique d'argent. */
  showVideos: boolean;
}

const DEFAULT_STATE: FiltersState = {
  preset: '30d',
  customFrom: toIsoDate(subDays(new Date(), 29)),
  customTo: toIsoDate(new Date()),
  customLabel: null,
  granularity: 'auto',
  channelIds: [],
  includeUnassigned: true,
  moneyMode: 'revenue',
  includeInKind: true,
  showVideos: true,
};

/** Convertit un préréglage en bornes de dates concrètes. */
const resolveRange = (state: FiltersState): { from: string; to: string } => {
  const today = new Date();
  const to = toIsoDate(today);

  switch (state.preset) {
    case '7d':
      return { from: toIsoDate(subDays(today, 6)), to };
    case '30d':
      return { from: toIsoDate(subDays(today, 29)), to };
    case '90d':
      return { from: toIsoDate(subDays(today, 89)), to };
    case '12m':
      return { from: toIsoDate(subMonths(today, 12)), to };
    case 'mtd':
      // Depuis le 1er du mois en cours, pas « les 30 derniers jours » : c'est la borne
      // qui compte pour un bilan mensuel.
      return { from: toIsoDate(startOfMonth(today)), to };
    case 'qtd':
      // Depuis le premier jour du trimestre en cours : la maille des échéances fiscales.
      return { from: toIsoDate(startOfQuarter(today)), to };
    case 'ytd':
      return { from: toIsoDate(startOfYear(today)), to };
    case 'all':
      // Pas de date de création connue côté client : 5 ans couvrent tout historique YouTube utile.
      return { from: toIsoDate(subYears(today, 5)), to };
    case 'custom':
      return state.customFrom <= state.customTo
        ? { from: state.customFrom, to: state.customTo }
        : { from: state.customTo, to: state.customFrom };
  }
};

interface FiltersContextValue extends FiltersState {
  from: string;
  to: string;
  /** Granularité effective, une fois `auto` résolu. */
  effectiveGranularity: Granularity;
  set: (patch: Partial<FiltersState>) => void;
  reset: () => void;
}

const FiltersContext = createContext<FiltersContextValue | null>(null);

/**
 * Filtres partagés par toutes les pages (période, chaînes, mode d'argent).
 * Persistés en local pour qu'un rechargement ne remette pas le dashboard à zéro.
 */
export const FiltersProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useLocalStorage<FiltersState>('acs.filters', DEFAULT_STATE);

  const value = useMemo<FiltersContextValue>(() => {
    // Un état persisté d'une version antérieure peut manquer de champs.
    const merged = { ...DEFAULT_STATE, ...state };
    const range = resolveRange(merged);

    return {
      ...merged,
      ...range,
      effectiveGranularity:
        merged.granularity === 'auto' ? DEFAULT_GRANULARITY[merged.preset] : merged.granularity,
      set: (patch) => setState((current) => ({ ...DEFAULT_STATE, ...current, ...patch })),
      reset: () => setState(DEFAULT_STATE),
    };
  }, [state, setState]);

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
};

export const useFilters = (): FiltersContextValue => {
  const context = useContext(FiltersContext);
  if (!context) throw new Error('useFilters doit être utilisé dans un FiltersProvider');
  return context;
};

/** Paramètres prêts à passer à `useAnalytics`. */
export const useAnalyticsParams = () => {
  const filters = useFilters();
  return useMemo(
    () => ({
      from: filters.from,
      to: filters.to,
      granularity: filters.effectiveGranularity,
      channelIds: filters.channelIds,
      includeUnassigned: filters.includeUnassigned,
    }),
    [
      filters.from,
      filters.to,
      filters.effectiveGranularity,
      filters.channelIds,
      filters.includeUnassigned,
    ],
  );
};
