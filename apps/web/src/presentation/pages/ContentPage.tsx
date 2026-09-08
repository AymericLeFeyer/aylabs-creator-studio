import { useMemo } from 'react';
import { Clock, Eye, Heart, Library, Users, Video } from 'lucide-react';
import { useAnalytics } from '../../application/analytics/usecases/useAnalytics.ts';
import { useProductionOverview } from '../../application/production/usecases/useProductions.ts';
import { useVideos } from '../../application/video/usecases/useVideos.ts';
import { useAnalyticsParams, useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { compareTotals } from '../../domain/analytics/services/revenueMath.ts';
import { formatNumber } from '../../shared/format.ts';
import { StatCard } from '../components/StatCard.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { AudienceChart } from '../components/charts/AudienceChart.tsx';
import { VideoPerformanceChart } from '../components/charts/VideoPerformanceChart.tsx';
import { VideoPerformanceTable } from '../components/charts/VideoPerformanceTable.tsx';
import { LatestVideoCard } from '../components/content/LatestVideoCard.tsx';

/**
 * Tout ce qui concerne les vidéos déjà sorties, sur la période choisie en haut.
 *
 * L'écran ne porte que de la **mesure** : combien de sorties, ce qu'elles ont fait, et
 * laquelle sort du lot. Ce qui n'est pas encore publié se pilote sur `/production`, et
 * la dernière sortie se lit sur le dashboard — les rappeler ici ferait trois endroits
 * où lire la même chose.
 *
 * Deux tableaux et non un : les **sorties de la période**, et le **catalogue** (tout ce
 * qui est sorti avant). Une chaîne fait le plus gros de ses vues sur ce qu'elle a déjà
 * publié ; ne montrer que les nouveautés laissait croire que le reste avait disparu.
 */
export const ContentPage = () => {
  const filters = useFilters();
  const privacy = usePrivacy();
  const params = useAnalyticsParams();
  const { data, isLoading } = useAnalytics(params);

  const { data: overview } = useProductionOverview();

  // Sans bornes de date, comme sur le dashboard : « ma dernière vidéo, elle marche
  // comment » ne se pose pas dans une fenêtre de temps, et une période de sept jours
  // viderait le bloc précisément quand on vient le lire.
  const { data: latestVideos = [] } = useVideos({ channelIds: filters.channelIds, limit: 3 });

  const periodVideos = useMemo(() => data?.videoPerformance ?? [], [data]);
  const catalog = useMemo(() => data?.catalogPerformance ?? [], [data]);

  /**
   * Les vues de la période qui ne viennent **pas** des sorties de la période.
   *
   * C'est une estimation, et elle est annoncée comme telle : les compteurs par vidéo
   * sont des cumuls depuis la sortie (YouTube Analytics n'est collecté par vidéo qu'en
   * cumul, jamais jour par jour), alors que le total de la période vient des métriques
   * quotidiennes. La soustraction ne tombe donc juste que sur une période qui va
   * jusqu'à aujourd'hui — d'où le plancher à zéro plutôt qu'un nombre négatif absurde.
   */
  const catalogViews = useMemo(() => {
    if (!data) return 0;
    const fromNew = periodVideos.reduce((total, video) => total + video.views, 0);
    return Math.max(0, data.totals.views - fromNew);
  }, [data, periodVideos]);

  const catalogShare = data && data.totals.views > 0 ? catalogViews / data.totals.views : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="hidden text-lg font-semibold lg:block">Contenu</h1>
        <p className="text-sm text-muted-foreground">
          {periodVideos.length} sortie(s) sur la période · {catalog.length} vidéo(s) au catalogue ·{' '}
          {overview?.queue.length ?? 0} en production
        </p>
      </div>

      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          <StatCard
            label="Vidéos publiées"
            value={formatNumber(data.totals.videosPublished)}
            change={compareTotals(data.totals, data.previousTotals, (t) => t.videosPublished)}
            hint="sorties sur la période"
            icon={<Video className="h-4 w-4" />}
          />
          <StatCard
            label="Vues"
            value={privacy.count(data.totals.views, 'views')}
            change={privacy.change(
              compareTotals(data.totals, data.previousTotals, (t) => t.views),
              'views',
            )}
            icon={<Eye className="h-4 w-4" />}
          />
          {/* La question posée : « je fais aussi des vues sur mes anciennes vidéos ». */}
          <StatCard
            label="Vues du catalogue"
            value={privacy.count(catalogViews, 'views')}
            hint={
              privacy.isMasked('views')
                ? 'part du catalogue masquée'
                : `${Math.round(catalogShare * 100)} % des vues, hors sorties de la période`
            }
            icon={<Library className="h-4 w-4" />}
            details={
              <p className="text-muted-foreground">
                Estimation : les vues de la période moins celles cumulées par les vidéos sorties
                pendant cette même période. YouTube ne fournit les compteurs par vidéo qu'en cumul
                depuis la sortie, jamais jour par jour — le chiffre est donc juste sur une période
                qui va jusqu'à aujourd'hui, et approché sur une période passée.
              </p>
            }
          />
          <StatCard
            label="Abonnés gagnés"
            value={privacy.signed(data.totals.subscribersNet, 'subscribers')}
            change={privacy.change(
              compareTotals(data.totals, data.previousTotals, (t) => t.subscribersNet),
              'subscribers',
            )}
            hint={
              data.totals.subscribersTotal === null
                ? 'total inconnu'
                : `${privacy.count(data.totals.subscribersTotal, 'subscribers')} au total`
            }
            icon={<Users className="h-4 w-4" />}
            accent={data.totals.subscribersNet < 0 ? 'var(--negative)' : undefined}
          />
          <StatCard
            label="Heures vues"
            value={privacy.hours(data.totals.watchHours, 'views')}
            change={privacy.change(
              compareTotals(data.totals, data.previousTotals, (t) => t.watchHours),
              'views',
            )}
            icon={<Clock className="h-4 w-4" />}
          />
          <StatCard
            label="Engagement"
            value={privacy.count(data.totals.likes, 'views')}
            change={privacy.change(
              compareTotals(data.totals, data.previousTotals, (t) => t.likes),
              'views',
            )}
            hint={`${privacy.count(data.totals.comments, 'views')} commentaires`}
            icon={<Heart className="h-4 w-4" />}
          />
        </div>
      )}

      {isLoading && !data && (
        <div className="h-80 animate-pulse rounded-xl border border-border bg-card" />
      )}

      {/* La dernière sortie avant les courbes : c'est la question qui suit les totaux,
          et l'écran Contenu est celui où on vient précisément la poser. Ses compteurs
          sont des cumuls depuis la sortie — ils ne s'additionnent pas avec les totaux
          de la période affichés au-dessus. */}
      <LatestVideoCard videos={latestVideos} />

      {data && (
        <>
          <AudienceChart data={data} />

          <Tabs defaultValue="periode">
            <TabsList>
              <TabsTrigger value="periode">
                Sorties de la période ({periodVideos.length})
              </TabsTrigger>
              <TabsTrigger value="catalogue">Catalogue ({catalog.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="periode">
              {/* Le classement à gauche, le tableau complet à droite : on repère la
                  vidéo qui sort du lot, puis on lit la ligne qui l'explique. */}
              <div className="grid gap-4 2xl:grid-cols-2">
                <VideoPerformanceChart data={data} />
                <VideoPerformanceTable data={data} />
              </div>
            </TabsContent>

            <TabsContent value="catalogue">
              <VideoPerformanceTable
                data={data}
                rows={catalog}
                title="Catalogue"
                subtitle={`${catalog.length} vidéo(s) sortie(s) avant la période, les plus vues d'abord. Compteurs cumulés depuis chaque sortie.`}
                emptyLabel="Aucune vidéo antérieure connue. Les vidéos arrivent avec la collecte."
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
};
