import { useProductionOverview } from '../../application/production/usecases/useProductions.ts';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { Block } from '../dashboard/Block.tsx';
import { useAnalyticsData } from '../blocks/blockData.ts';

/**
 * Tout ce qui concerne les vidéos déjà sorties, sur la période choisie en haut.
 *
 * L'écran ne porte que de la **mesure** : combien de sorties, ce qu'elles ont fait, et
 * laquelle sort du lot. Ce qui n'est pas encore publié se pilote sur `/production`.
 *
 * Deux tableaux et non un : les **sorties de la période**, et le **catalogue** (tout ce
 * qui est sorti avant). Une chaîne fait le plus gros de ses vues sur ce qu'elle a déjà
 * publié ; ne montrer que les nouveautés laissait croire que le reste avait disparu.
 *
 * Chaque carte est un bloc du catalogue (`<Block>`) : ajoutable au dashboard au survol.
 */
export const ContentPage = () => {
  const { data, isLoading } = useAnalyticsData();
  const { data: overview } = useProductionOverview();

  const periodCount = data?.videoPerformance.length ?? 0;
  const catalogCount = data?.catalogPerformance?.length ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">YouTube</h1>
          <p className="text-sm text-muted-foreground">
            {periodCount} sortie(s) sur la période · {catalogCount} vidéo(s) au catalogue ·{' '}
            {overview?.queue.length ?? 0} en production
          </p>
        </div>
      </div>

      {/* Les chiffres de la chaîne, hors période : où elle en est aujourd'hui. Une rangée
          à part, pour qu'on ne lise pas « 12 400 vues » d'un côté et « 1,2 M » de l'autre
          comme deux mesures de la même chose. */}
      <div className="grid grid-cols-3 gap-3">
        <Block id="youtube.lifetime.subscribers" />
        <Block id="youtube.lifetime.views" />
        <Block id="youtube.lifetime.videos" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Block id="youtube.videosPublished" />
        <Block id="youtube.views" />
        <Block id="youtube.catalogViews" />
        <Block id="youtube.subscribers" />
        <Block id="youtube.watchHours" />
        <Block id="youtube.engagement" />
      </div>

      {isLoading && !data && (
        <div className="h-80 animate-pulse rounded-xl border border-border bg-card" />
      )}

      {/* La dernière sortie avant les courbes : c'est la question qui suit les totaux. Ses
          compteurs sont des cumuls depuis la sortie. */}
      <Block id="youtube.latest" />

      <Block id="youtube.audience" />

      <Tabs defaultValue="periode">
        <TabsList>
          <TabsTrigger value="periode">Sorties de la période ({periodCount})</TabsTrigger>
          <TabsTrigger value="catalogue">Catalogue ({catalogCount})</TabsTrigger>
        </TabsList>

        <TabsContent value="periode">
          {/* Le classement à gauche, le tableau complet à droite : on repère la vidéo qui
              sort du lot, puis on lit la ligne qui l'explique. */}
          <div className="grid gap-4 2xl:grid-cols-2">
            <Block id="youtube.ranking" />
            <Block id="youtube.periodTable" />
          </div>
        </TabsContent>

        <TabsContent value="catalogue">
          <Block id="youtube.catalog" />
        </TabsContent>
      </Tabs>
    </div>
  );
};
