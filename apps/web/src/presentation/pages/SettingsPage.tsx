import { useSearchParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import { useAnalytics } from '../../application/analytics/usecases/useAnalytics.ts';
import { useAnalyticsParams, useFilters } from '../hooks/useFilters.tsx';
import { usePreferences } from '../hooks/usePreferences.ts';
import { useTheme } from '../hooks/useTheme.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { orderedNav } from '../navigation.ts';
import { Checkbox } from '../components/ui/checkbox.tsx';
import { Label } from '../components/ui/label.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { ChannelsPage } from './ChannelsPage.tsx';
import { CategoriesPage } from './CategoriesPage.tsx';
import { BrandsPage } from './BrandsPage.tsx';
import { StepsPage } from './StepsPage.tsx';
import { PlanningSettingsPage } from './PlanningSettingsPage.tsx';
import { InstagramSettingsPage } from './InstagramSettingsPage.tsx';
import { CompanyPage } from './CompanyPage.tsx';
import { RecurringExpensesPanel } from '../components/money/RecurringExpensesPanel.tsx';

const TABS = [
  'app',
  'chaines',
  'instagram',
  'categories',
  'abonnements',
  'marques',
  'etapes',
  'planning',
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
          <TabsTrigger value="instagram">Instagram</TabsTrigger>
          <TabsTrigger value="categories">Catégories</TabsTrigger>
          <TabsTrigger value="abonnements">Abonnements</TabsTrigger>
          <TabsTrigger value="marques">Marques</TabsTrigger>
          <TabsTrigger value="etapes">Étapes</TabsTrigger>
          <TabsTrigger value="planning">Planning</TabsTrigger>
          <TabsTrigger value="societe">Société</TabsTrigger>
        </TabsList>

        <TabsContent value="app">
          <AppSettings />
        </TabsContent>
        <TabsContent value="chaines">
          <ChannelsPage />
        </TabsContent>
        <TabsContent value="instagram">
          <InstagramSettingsPage />
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
        <TabsContent value="planning">
          <PlanningSettingsPage />
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

      <NavOrderSettings />
    </div>
  );
};

/**
 * L'ordre des écrans dans la barre de gauche.
 *
 * La liste grandit à chaque fonctionnalité ajoutée, et l'ordre livré n'est qu'un pari :
 * celui qui vit dans sa file de production et celui qui vit dans sa comptabilité n'ouvrent
 * pas le même écran chaque matin. Deux flèches suffisent — une liste de huit lignes ne
 * justifie pas une dépendance de glisser-déposer.
 *
 * L'ordre est stocké **par adresse** et non par rang : un écran ajouté ou retiré par une
 * mise à jour décalerait sinon tout ce qui suit, et le menu se mélangerait tout seul.
 */
const NavOrderSettings = () => {
  const { preferences, set } = usePreferences();
  const nav = orderedNav(preferences.navOrder);

  const move = (index: number, direction: -1 | 1) => {
    const next = [...nav];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target]!, next[index]!];
    set({ navOrder: next.map((item) => item.to) });
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Ordre du menu</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            L’ordre des écrans dans la barre de gauche. Mets en tête celui que tu ouvres en
            arrivant.
          </p>
        </div>
        {preferences.navOrder.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => set({ navOrder: [] })}>
            <RotateCcw className="h-4 w-4" />
            Ordre par défaut
          </Button>
        )}
      </CardHeader>

      <CardContent>
        <div className="grid gap-1 sm:grid-cols-2">
          {nav.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.to}
                className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5"
              >
                <span className="w-5 shrink-0 text-xs tabular text-muted-foreground">
                  {index + 1}
                </span>
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>

                <div className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    title="Monter"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                    <span className="sr-only">Monter {item.label}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    disabled={index === nav.length - 1}
                    onClick={() => move(index, 1)}
                    title="Descendre"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                    <span className="sr-only">Descendre {item.label}</span>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};
