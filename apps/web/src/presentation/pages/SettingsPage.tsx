import { useSearchParams } from 'react-router-dom';
import { useAnalytics } from '../../application/analytics/usecases/useAnalytics.ts';
import { useAnalyticsParams, useFilters } from '../hooks/useFilters.tsx';
import { usePreferences } from '../hooks/usePreferences.ts';
import { useTheme } from '../hooks/useTheme.ts';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Label } from '../components/ui/label.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { ChannelsPage } from './ChannelsPage.tsx';
import { CategoriesPage } from './CategoriesPage.tsx';
import { BrandsPage } from './BrandsPage.tsx';
import { StepsPage } from './StepsPage.tsx';
import { CompanyPage } from './CompanyPage.tsx';
import { RecurringExpensesPanel } from '../components/money/RecurringExpensesPanel.tsx';

const TABS = [
  'app',
  'chaines',
  'categories',
  'abonnements',
  'marques',
  'etapes',
  'societe',
] as const;
type SettingsTab = (typeof TABS)[number];

/**
 * Tous les réglages, dans un seul écran à onglets.
 *
 * C'étaient cinq entrées d'un menu déroulant, donc cinq adresses à connaître et autant
 * d'allers-retours pour comparer deux référentiels. Réunis, ils se parcourent : on
 * configure rarement une seule chose, et l'onglet ouvert reste dans l'URL (`?onglet=`)
 * pour qu'un signet ou un retour arrière retombe au bon endroit.
 *
 * Les anciennes adresses (`/chaines`, `/categories`…) redirigent ici, sur le bon onglet.
 */
export const SettingsPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('onglet');
  const tab: SettingsTab = TABS.includes(requested as SettingsTab)
    ? (requested as SettingsTab)
    : 'app';

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Les référentiels de l'outil et la façon dont il s'affiche.
        </p>
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ onglet: value }, { replace: true })}
      >
        <TabsList className="flex-wrap">
          <TabsTrigger value="app">Application</TabsTrigger>
          <TabsTrigger value="chaines">Chaînes</TabsTrigger>
          <TabsTrigger value="categories">Catégories</TabsTrigger>
          <TabsTrigger value="abonnements">Abonnements</TabsTrigger>
          <TabsTrigger value="marques">Marques</TabsTrigger>
          <TabsTrigger value="etapes">Étapes</TabsTrigger>
          <TabsTrigger value="societe">Société</TabsTrigger>
        </TabsList>

        <TabsContent value="app">
          <AppSettings />
        </TabsContent>
        <TabsContent value="chaines">
          <ChannelsPage />
        </TabsContent>
        <TabsContent value="categories">
          <CategoriesPage />
        </TabsContent>
        <TabsContent value="abonnements">
          <RecurringExpensesPanel />
        </TabsContent>
        <TabsContent value="marques">
          <BrandsPage />
        </TabsContent>
        <TabsContent value="etapes">
          <StepsPage />
        </TabsContent>
        <TabsContent value="societe">
          <CompanyPage />
        </TabsContent>
      </Tabs>
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
    </div>
  );
};
