import { Fragment, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AppWindow,
  Building2,
  CalendarClock,
  ChevronDown,
  FileText,
  Instagram,
  KeyRound,
  ListOrdered,
  SlidersHorizontal,
  Tags,
  Wallet,
  Youtube,
  type LucideIcon,
} from 'lucide-react';
import { useAnalytics } from '../../application/analytics/usecases/useAnalytics.ts';
import { useAnalyticsParams, useFilters } from '../hooks/useFilters.tsx';
import { usePreferences } from '../hooks/usePreferences.ts';
import { useTheme } from '../hooks/useTheme.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Label } from '../components/ui/label.tsx';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '../components/ui/dropdown-menu.tsx';
import { ChannelsPage } from './ChannelsPage.tsx';
import { CategoriesPage } from './CategoriesPage.tsx';
import { BrandsPage } from './BrandsPage.tsx';
import { StepsPage } from './StepsPage.tsx';
import { ScriptSettingsPage } from './ScriptSettingsPage.tsx';
import { PlanningSettingsPage } from './PlanningSettingsPage.tsx';
import { InstagramSettingsPage } from './InstagramSettingsPage.tsx';
import { CompanyPage } from './CompanyPage.tsx';
import { ApiSettingsPage } from './ApiSettingsPage.tsx';
import { ExternalAppsSettingsPage } from './ExternalAppsSettingsPage.tsx';
import { RecurringExpensesPanel } from '../components/money/RecurringExpensesPanel.tsx';
import { PrivacySettings } from '../components/PrivacySettings.tsx';
import { cn } from '../../shared/cn.ts';

interface SettingsEntry {
  /** Valeur de `?onglet=`, et identifiant de l'entrée. */
  id: string;
  label: string;
  icon: LucideIcon;
  render: () => ReactNode;
}

interface SettingsGroup {
  label: string;
  entries: SettingsEntry[];
}

/**
 * Les réglages, **rangés comme le menu principal** : Production, Audience, Revenus,
 * Entreprise — plus Général en tête, et deux familles propres aux réglages (API,
 * Applications externes).
 *
 * C'était une rangée de onze onglets, sur deux lignes dès que l'écran rétrécissait, dans
 * un ordre qui ne disait rien : « Catégories » à côté d'« Instagram », « Étapes » à côté
 * de « Marques ». Rangés dans les mêmes familles que les écrans qu'ils configurent, on
 * les trouve là où on les cherche — les réglages du planning sous Production, parce que
 * c'est là qu'est le planning.
 *
 * **Une liste verticale et non des onglets** : elle se lit de haut en bas comme le menu
 * de gauche, les intitulés de famille y ont leur place, et elle peut grandir sans passer
 * à la ligne. Sur mobile, elle se replie en un seul bouton qui affiche l'entrée ouverte et
 * déroule toute la liste — une colonne de quinze lignes au-dessus du contenu aurait
 * repoussé le réglage sous le pli.
 *
 * Les catégories et les abonnements forment **une seule** entrée, « Chiffre
 * d'affaires » : ce sont les deux référentiels de l'écran du même nom.
 */
const GROUPS: SettingsGroup[] = [
  {
    label: 'Général',
    entries: [
      { id: 'general', label: 'Affichage', icon: SlidersHorizontal, render: () => <AppSettings /> },
    ],
  },
  {
    label: 'Production',
    entries: [
      {
        id: 'planning',
        label: 'Planning',
        icon: CalendarClock,
        render: () => <PlanningSettingsPage />,
      },
      { id: 'script', label: 'Script', icon: FileText, render: () => <ScriptSettingsPage /> },
      { id: 'etapes', label: 'Étapes', icon: ListOrdered, render: () => <StepsPage /> },
    ],
  },
  {
    label: 'Audience',
    entries: [
      { id: 'youtube', label: 'YouTube', icon: Youtube, render: () => <ChannelsPage /> },
      {
        id: 'instagram',
        label: 'Instagram',
        icon: Instagram,
        render: () => <InstagramSettingsPage />,
      },
    ],
  },
  {
    label: 'Revenus',
    entries: [
      {
        id: 'chiffre-affaires',
        label: "Chiffre d'affaires",
        icon: Wallet,
        render: () => (
          <div className="space-y-8">
            <CategoriesPage />
            <RecurringExpensesPanel />
          </div>
        ),
      },
      { id: 'marques', label: 'Marques', icon: Tags, render: () => <BrandsPage /> },
    ],
  },
  {
    label: 'Entreprise',
    entries: [{ id: 'societe', label: 'Société', icon: Building2, render: () => <CompanyPage /> }],
  },
  {
    label: 'API',
    entries: [
      { id: 'api', label: 'Export & sources', icon: KeyRound, render: () => <ApiSettingsPage /> },
    ],
  },
  {
    label: 'Applications externes',
    entries: [
      {
        id: 'applications',
        label: 'Applications',
        icon: AppWindow,
        render: () => <ExternalAppsSettingsPage />,
      },
    ],
  },
];

const ENTRIES = GROUPS.flatMap((group) => group.entries.map((entry) => ({ group, entry })));

/**
 * Les anciens identifiants d'onglet, pour que les signets et les liens déjà écrits
 * retombent au bon endroit après le regroupement.
 */
const ALIASES: Record<string, string> = {
  app: 'general',
  chaines: 'youtube',
  categories: 'chiffre-affaires',
  abonnements: 'chiffre-affaires',
};

/**
 * Tous les réglages, dans un seul écran.
 *
 * L'entrée ouverte reste dans l'URL (`?onglet=`) pour qu'un signet ou un retour arrière
 * retombe au bon endroit. Les anciennes adresses (`/chaines`, `/categories`…) redirigent
 * ici, sur la bonne entrée.
 */
export const SettingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('onglet') ?? 'general';
  const id = ALIASES[requested] ?? requested;
  const active = ENTRIES.find(({ entry }) => entry.id === id) ?? ENTRIES[0]!;
  const select = (value: string) => setSearchParams({ onglet: value }, { replace: true });
  const ActiveIcon = active.entry.icon;

  return (
    <div className="space-y-4">
      <div className="hidden lg:block">
        <h1 className="text-lg font-semibold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Les référentiels de l’outil et la façon dont il s’affiche, rangés comme le menu.
        </p>
      </div>

      {/* Mobile : un seul bouton, qui dit où l'on est et déroule tout le reste. */}
      <div className="lg:hidden">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <span className="flex min-w-0 items-center gap-2">
                <ActiveIcon className="h-4 w-4 shrink-0" />
                <span className="truncate">
                  <span className="text-muted-foreground">{active.group.label} · </span>
                  {active.entry.label}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="max-h-[70dvh] w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto"
          >
            {GROUPS.map((group) => (
              <Fragment key={group.label}>
                <DropdownMenuLabel>{group.label}</DropdownMenuLabel>
                {group.entries.map((entry) => (
                  <DropdownMenuItem
                    key={entry.id}
                    onSelect={() => select(entry.id)}
                    className={cn(entry.id === active.entry.id && 'bg-secondary')}
                  >
                    <entry.icon className="h-4 w-4 text-muted-foreground" />
                    {entry.label}
                  </DropdownMenuItem>
                ))}
              </Fragment>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="lg:grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        {/* Grand écran : la liste verticale, collante sous l'en-tête pour rester à portée
            pendant qu'on descend dans un long référentiel. */}
        <nav aria-label="Rubriques des paramètres" className="hidden lg:block">
          <div className="sticky top-[calc(var(--app-header)+1.5rem)] flex flex-col gap-3">
            {GROUPS.map((group) => (
              <div key={group.label} className="flex flex-col gap-0.5">
                <p className="px-2.5 pb-1 text-[0.68rem] font-semibold tracking-wide text-muted-foreground uppercase">
                  {group.label}
                </p>
                {group.entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => select(entry.id)}
                    aria-current={entry.id === active.entry.id ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium transition-colors',
                      entry.id === active.entry.id
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    <entry.icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{entry.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </nav>

        <div className="min-w-0">{active.entry.render()}</div>
      </div>
    </div>
  );
};

/**
 * Les réglages d'affichage.
 *
 * Ils vivent ici et non dans la barre de filtres : un filtre change *ce qu'on regarde*
 * et se règle plusieurs fois par session, une préférence change *comment l'outil se
 * présente* et se règle une fois. « Marquer les sorties de vidéo » était le seul réglage
 * de la barre à ne jamais bouger — il occupait une place que la barre n'avait plus.
 */
const AppSettings = () => {
  const filters = useFilters();
  const { preferences, set } = usePreferences();
  const { theme, toggle } = useTheme();

  // Même clé de cache que le dashboard : la requête est partagée, pas dupliquée.
  const { data } = useAnalytics(useAnalyticsParams());
  const videoCount = data?.videos.length ?? 0;

  const row = (
    id: string,
    checked: boolean,
    onChange: (value: boolean) => void,
    label: string,
    hint: string,
  ) => (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
        className="mt-0.5"
      />
      <div className="space-y-0.5">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold">Général</h2>
        <p className="text-sm text-muted-foreground">
          Comment l’outil se présente, et ce qu’il accepte de laisser voir.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Graphiques</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {row(
              'pref-show-videos',
              filters.showVideos,
              (value) => filters.set({ showVideos: value }),
              'Marquer les sorties de vidéo',
              videoCount === 0
                ? 'Trait vertical à chaque sortie sur les graphiques. Aucune sortie connue sur la période — les vidéos sont enregistrées à chaque collecte.'
                : `Trait vertical à chaque sortie sur les graphiques d'argent et d'audience. ${videoCount} sortie(s) connue(s) sur la période affichée.`,
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Affichage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {row(
              'pref-sidebar',
              preferences.sidebarCollapsed,
              (value) => set({ sidebarCollapsed: value }),
              'Menu replié',
              'La barre de gauche ne montre que les icônes. Le libellé revient en infobulle.',
            )}

            {row(
              'pref-compact-queue',
              preferences.compactQueue,
              (value) => set({ compactQueue: value }),
              'File de production compacte',
              'Une ligne par vidéo au lieu d’une carte. Le chevron rouvre celle qu’on travaille.',
            )}

            {row(
              'pref-theme',
              theme === 'dark',
              () => toggle(),
              'Thème sombre',
              'Se change aussi depuis le bas du menu de gauche.',
            )}
          </CardContent>
        </Card>

        {/* Sur toute la largeur : c'est la seule carte de l'onglet qui porte une liste,
            et la couper en deux colonnes séparerait un groupe de ses cases. */}
        <div className="lg:col-span-2">
          <PrivacySettings />
        </div>
      </div>
    </div>
  );
};
