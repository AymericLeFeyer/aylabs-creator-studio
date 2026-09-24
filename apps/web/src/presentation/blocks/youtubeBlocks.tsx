import { useMemo } from 'react';
import { Clapperboard, Clock, Eye, Heart, Library, TrendingUp, Users, Video } from 'lucide-react';
import { useChannels } from '../../application/channel/usecases/useChannels.ts';
import { useVideos } from '../../application/video/usecases/useVideos.ts';
import { compareTotals } from '../../domain/analytics/services/revenueMath.ts';
import { formatDate, formatNumber } from '../../shared/format.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { VideoList } from '../components/StatCardLists.tsx';
import { AudienceChart } from '../components/charts/AudienceChart.tsx';
import { VideoPerformanceChart } from '../components/charts/VideoPerformanceChart.tsx';
import { VideoPerformanceTable } from '../components/charts/VideoPerformanceTable.tsx';
import { LatestVideoCard } from '../components/content/LatestVideoCard.tsx';
import { useAnalyticsData } from './blockData.ts';
import { BlockSkeleton } from './BlockSkeleton.tsx';

/**
 * Les blocs YouTube. Chacun lit l'aperçu par `useAnalyticsData` — même clé de cache que
 * l'écran `/youtube`, donc une seule requête.
 */

const PENDING = '…';

export const YouTubeViewsCard = () => {
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();
  return (
    <StatCard
      label="Vues"
      value={data ? privacy.count(data.totals.views, 'views') : PENDING}
      change={
        data
          ? privacy.change(
              compareTotals(data.totals, data.previousTotals, (t) => t.views),
              'views',
            )
          : undefined
      }
      icon={<Eye className="h-4 w-4" />}
    />
  );
};

/** Le gain en gros, le total en petit : sur une période, c'est la progression qui se pilote. */
export const YouTubeSubscribersCard = () => {
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();
  return (
    <StatCard
      label="Abonnés gagnés"
      value={data ? privacy.signed(data.totals.subscribersNet, 'subscribers') : PENDING}
      change={
        data
          ? privacy.change(
              compareTotals(data.totals, data.previousTotals, (t) => t.subscribersNet),
              'subscribers',
            )
          : undefined
      }
      hint={
        !data
          ? undefined
          : data.totals.subscribersTotal === null
            ? 'total inconnu'
            : `${privacy.count(data.totals.subscribersTotal, 'subscribers')} au total`
      }
      icon={<Users className="h-4 w-4" />}
      accent={data && data.totals.subscribersNet < 0 ? 'var(--negative)' : undefined}
    />
  );
};

export const YouTubeWatchHoursCard = () => {
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();
  return (
    <StatCard
      label="Heures vues"
      value={data ? privacy.hours(data.totals.watchHours, 'views') : PENDING}
      change={
        data
          ? privacy.change(
              compareTotals(data.totals, data.previousTotals, (t) => t.watchHours),
              'views',
            )
          : undefined
      }
      icon={<Clock className="h-4 w-4" />}
    />
  );
};

export const YouTubeEngagementCard = () => {
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();
  return (
    <StatCard
      label="Engagement"
      value={data ? privacy.count(data.totals.likes, 'views') : PENDING}
      change={
        data
          ? privacy.change(
              compareTotals(data.totals, data.previousTotals, (t) => t.likes),
              'views',
            )
          : undefined
      }
      hint={data ? `${privacy.count(data.totals.comments, 'views')} commentaires` : undefined}
      icon={<Heart className="h-4 w-4" />}
    />
  );
};

export const YouTubeVideosPublishedCard = () => {
  const { data } = useAnalyticsData();
  return (
    <StatCard
      label="Vidéos publiées"
      value={data ? formatNumber(data.totals.videosPublished) : PENDING}
      change={
        data ? compareTotals(data.totals, data.previousTotals, (t) => t.videosPublished) : undefined
      }
      hint="sorties sur la période"
      icon={<Video className="h-4 w-4" />}
      details={data ? <VideoList videos={data.videoPerformance} /> : undefined}
    />
  );
};

/**
 * « Je fais aussi des vues sur mes anciennes vidéos » : les vues de la période moins celles
 * des sorties de la période. Une estimation, annoncée comme telle — les compteurs par vidéo
 * sont des cumuls depuis la sortie. Toutes les sorties, Shorts compris : `totals.views` les
 * compte, la soustraction aussi.
 */
export const YouTubeCatalogViewsCard = () => {
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();
  const catalogViews = data
    ? Math.max(
        0,
        data.totals.views - data.videoPerformance.reduce((sum, video) => sum + video.views, 0),
      )
    : 0;
  const share = data && data.totals.views > 0 ? catalogViews / data.totals.views : 0;
  return (
    <StatCard
      label="Vues du catalogue"
      value={data ? privacy.count(catalogViews, 'views') : PENDING}
      hint={
        privacy.isMasked('views')
          ? 'part du catalogue masquée'
          : `${Math.round(share * 100)} % des vues, hors sorties de la période`
      }
      icon={<Library className="h-4 w-4" />}
      details={
        <p className="text-muted-foreground">
          Estimation : les vues de la période moins celles cumulées par les vidéos sorties pendant
          cette même période. YouTube ne fournit les compteurs par vidéo qu'en cumul depuis la
          sortie, jamais jour par jour — le chiffre est donc juste sur une période qui va jusqu'à
          aujourd'hui, et approché sur une période passée.
        </p>
      }
    />
  );
};

/**
 * Les trois chiffres de la chaîne **tels qu'ils sont aujourd'hui**, hors période : dernier
 * relevé de chaque chaîne retenue (un CUMUL), sommé entre chaînes.
 */
const useLifetime = () => {
  const filters = useFilters();
  const { data: channels = [] } = useChannels();
  return useMemo(() => {
    const selected = channels.filter(
      (channel) =>
        channel.latestSnapshot !== null &&
        (filters.channelIds.length === 0 || filters.channelIds.includes(channel.id)),
    );
    if (selected.length === 0) return null;
    const date = selected
      .map((channel) => channel.latestSnapshot!.date)
      .sort()
      .at(-1)!;
    return {
      subscribers: selected.reduce((sum, c) => sum + c.latestSnapshot!.subscribers, 0),
      views: selected.reduce((sum, c) => sum + c.latestSnapshot!.totalViews, 0),
      videos: selected.reduce((sum, c) => sum + c.latestSnapshot!.totalVideos, 0),
      hint: `depuis toujours · relevé du ${formatDate(date)}${
        selected.length > 1 ? ` · ${selected.length} chaînes` : ''
      }`,
    };
  }, [channels, filters.channelIds]);
};

export const YouTubeLifetimeSubscribersCard = () => {
  const privacy = usePrivacy();
  const lifetime = useLifetime();
  return (
    <StatCard
      label="Abonnés"
      value={lifetime ? privacy.count(lifetime.subscribers, 'subscribers') : '—'}
      hint={lifetime?.hint ?? 'aucun relevé'}
      icon={<Users className="h-4 w-4" />}
    />
  );
};

export const YouTubeLifetimeViewsCard = () => {
  const privacy = usePrivacy();
  const lifetime = useLifetime();
  return (
    <StatCard
      label="Vues au total"
      value={lifetime ? privacy.count(lifetime.views, 'views') : '—'}
      hint={lifetime?.hint ?? 'aucun relevé'}
      icon={<TrendingUp className="h-4 w-4" />}
    />
  );
};

export const YouTubeLifetimeVideosCard = () => {
  const lifetime = useLifetime();
  return (
    <StatCard
      label="Vidéos au total"
      value={lifetime ? formatNumber(lifetime.videos) : '—'}
      hint={lifetime?.hint ?? 'aucun relevé'}
      icon={<Clapperboard className="h-4 w-4" />}
    />
  );
};

/**
 * Les dix dernières sorties, **sans bornes de date** : « ma dernière vidéo marche comment »
 * ne se pose pas dans une fenêtre de temps. Dix, parce qu'une vidéo ne se juge qu'à côté de
 * celles qui la précèdent. Les vidéos masquées à la main (un Short, un direct) n'y comptent
 * pas.
 */
export const YouTubeLatestVideos = () => {
  const filters = useFilters();
  // Filtré côté API (`hidden: false`) : masquer une vidéo fait entrer la suivante, et la
  // liste compte toujours dix vraies dernières sorties.
  const { data: videos = [] } = useVideos({
    channelIds: filters.channelIds,
    limit: 10,
    hidden: false,
  });
  return <LatestVideoCard videos={videos} channelIds={filters.channelIds} />;
};

export const YouTubeAudienceChart = () => {
  const { data } = useAnalyticsData();
  return data ? <AudienceChart data={data} /> : <BlockSkeleton />;
};

export const YouTubeRanking = () => {
  const { data } = useAnalyticsData();
  return data ? <VideoPerformanceChart data={data} /> : <BlockSkeleton />;
};

export const YouTubePeriodTable = () => {
  const { data } = useAnalyticsData();
  return data ? <VideoPerformanceTable data={data} /> : <BlockSkeleton />;
};

export const YouTubeCatalogTable = () => {
  const { data } = useAnalyticsData();
  if (!data) return <BlockSkeleton />;
  const catalog = data.catalogPerformance ?? [];
  return (
    <VideoPerformanceTable
      data={data}
      rows={catalog}
      title="Catalogue"
      subtitle={`${catalog.length} vidéo(s) sortie(s) avant la période, les plus vues d'abord. Compteurs cumulés depuis chaque sortie.`}
      emptyLabel="Aucune vidéo antérieure connue. Les vidéos arrivent avec la collecte."
    />
  );
};
