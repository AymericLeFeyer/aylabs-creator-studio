import { useMemo } from 'react';
import { Clock, Eye, Heart, Users, Video } from 'lucide-react';
import { useAnalytics } from '../../application/analytics/usecases/useAnalytics.ts';
import { useProductionOverview } from '../../application/production/usecases/useProductions.ts';
import { useAnalyticsParams } from '../hooks/useFilters.tsx';
import { compareTotals } from '../../domain/analytics/services/revenueMath.ts';
import { formatHours, formatNumber, formatSigned } from '../../shared/format.ts';
import { StatCard } from '../components/StatCard.tsx';
import { AudienceChart } from '../components/charts/AudienceChart.tsx';
import { VideoPerformanceChart } from '../components/charts/VideoPerformanceChart.tsx';
import { VideoPerformanceTable } from '../components/charts/VideoPerformanceTable.tsx';

/**
 * Tout ce qui concerne les vidéos déjà sorties, sur la période choisie en haut.
 *
 * L'écran ne porte que de la **mesure** : combien de sorties, ce qu'elles ont fait, et
 * laquelle sort du lot. Ce qui n'est pas encore publié se pilote sur `/production`, et
 * la dernière sortie se lit sur le dashboard — les rappeler ici ferait trois endroits
 * où lire la même chose.
 */
export const ContentPage = () => {
  const params = useAnalyticsParams();
  const { data, isLoading } = useAnalytics(params);

  const { data: overview } = useProductionOverview();

  const periodVideos = useMemo(() => data?.videoPerformance ?? [], [data]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Contenu</h1>
        <p className="text-sm text-muted-foreground">
          {periodVideos.length} sortie(s) sur la période · {overview?.queue.length ?? 0} vidéo(s) en
          production
        </p>
      </div>

      {data && (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
          <StatCard
            label="Vidéos publiées"
            value={formatNumber(data.totals.videosPublished)}
            change={compareTotals(data.totals, data.previousTotals, (t) => t.videosPublished)}
            hint="sorties sur la période"
            icon={<Video className="h-4 w-4" />}
          />
          <StatCard
            label="Vues"
            value={formatNumber(data.totals.views)}
            change={compareTotals(data.totals, data.previousTotals, (t) => t.views)}
            icon={<Eye className="h-4 w-4" />}
          />
          <StatCard
            label="Abonnés gagnés"
            value={formatSigned(data.totals.subscribersNet)}
            change={compareTotals(data.totals, data.previousTotals, (t) => t.subscribersNet)}
            hint={
              data.totals.subscribersTotal === null
                ? 'total inconnu'
                : `${formatNumber(data.totals.subscribersTotal)} au total`
            }
            icon={<Users className="h-4 w-4" />}
            accent={data.totals.subscribersNet < 0 ? 'var(--negative)' : undefined}
          />
          <StatCard
            label="Heures vues"
            value={formatHours(data.totals.watchHours)}
            change={compareTotals(data.totals, data.previousTotals, (t) => t.watchHours)}
            icon={<Clock className="h-4 w-4" />}
          />
          <StatCard
            label="Engagement"
            value={formatNumber(data.totals.likes)}
            change={compareTotals(data.totals, data.previousTotals, (t) => t.likes)}
            hint={`${formatNumber(data.totals.comments)} commentaires`}
            icon={<Heart className="h-4 w-4" />}
          />
        </div>
      )}

      {isLoading && !data && (
        <div className="h-80 animate-pulse rounded-xl border border-border bg-card" />
      )}

      {data && (
        <>
          <AudienceChart data={data} />

          {/* Le classement à gauche, le tableau complet à droite : on repère la vidéo
              qui sort du lot, puis on lit la ligne qui l'explique. */}
          <div className="grid gap-4 2xl:grid-cols-2">
            <VideoPerformanceChart data={data} />
            <VideoPerformanceTable data={data} />
          </div>
        </>
      )}
    </div>
  );
};
