import { useMemo } from 'react';
import { Clapperboard, Clock, Eye, Heart, Library, TrendingUp, Users, Video } from 'lucide-react';
import { useChannels } from '../../application/channel/usecases/useChannels.ts';
import { useVideos } from '../../application/video/usecases/useVideos.ts';
import type { AnalyticsResult } from '../../domain/analytics/entities/Analytics.ts';
import { compareTotals } from '../../domain/analytics/services/revenueMath.ts';
import { formatDate, formatNumber } from '../../shared/format.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { VideoList } from '../components/StatCardLists.tsx';
import { StatDetails, type DetailRow } from '../components/StatDetails.tsx';
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

type Privacy = ReturnType<typeof usePrivacy>;

/** « Du 26 août au 25 sept. · période précédente : 12 400 ». */
const periodNote = (data: AnalyticsResult, previous: string | null) =>
  `Du ${formatDate(data.query.from)} au ${formatDate(data.query.to)}${
    previous ? ` · période précédente : ${previous}` : ''
  }.`;

/** Une ligne par chaîne, la plus forte d'abord — seulement s'il y en a plusieurs. */
const channelRows = (
  data: AnalyticsResult,
  pick: (row: AnalyticsResult['byChannel'][number]) => number,
  format: (value: number) => string,
): DetailRow[] =>
  data.byChannel.length < 2
    ? []
    : [...data.byChannel]
        .sort((a, b) => pick(b) - pick(a))
        .map((row) => ({
          key: row.channelId,
          label: row.channelName,
          color: row.color,
          value: format(pick(row)),
        }));

const days = (data: AnalyticsResult) =>
  Math.max(
    1,
    Math.round((Date.parse(data.query.to) - Date.parse(data.query.from)) / 86_400_000) + 1,
  );

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
      details={data ? <ViewsDetails data={data} privacy={privacy} /> : undefined}
    />
  );
};

const ViewsDetails = ({ data, privacy }: { data: AnalyticsResult; privacy: Privacy }) => {
  const newVideos = data.videoPerformance.reduce((total, video) => total + video.views, 0);
  return (
    <StatDetails
      title={data.byChannel.length > 1 ? 'Par chaîne' : 'Toutes les vues de la période'}
      rows={[
        ...channelRows(
          data,
          (row) => row.views,
          (value) => privacy.count(value, 'views'),
        ),
        {
          key: 'perDay',
          label: 'Par jour en moyenne',
          value: privacy.count(Math.round(data.totals.views / days(data)), 'views'),
        },
        {
          key: 'new',
          label: 'Dont sorties de la période',
          sub: `${data.videoPerformance.length} vidéo(s), cumul depuis leur sortie`,
          value: privacy.count(Math.min(newVideos, data.totals.views), 'views'),
        },
      ]}
      note={periodNote(
        data,
        data.previousTotals ? privacy.count(data.previousTotals.views, 'views') : null,
      )}
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
      details={
        data ? (
          <StatDetails
            title="Gagnés moins perdus"
            rows={[
              {
                key: 'gained',
                operator: '+',
                label: 'Nouveaux abonnés',
                value: privacy.count(data.totals.subscribersGained, 'subscribers'),
              },
              {
                key: 'lost',
                operator: '−',
                label: 'Désabonnements',
                value: privacy.count(data.totals.subscribersLost, 'subscribers'),
              },
              {
                key: 'net',
                operator: '=',
                label: 'Solde de la période',
                value: privacy.signed(data.totals.subscribersNet, 'subscribers'),
              },
              ...channelRows(
                data,
                (row) => row.subscribersNet,
                (value) => privacy.signed(value, 'subscribers'),
              ),
            ]}
            note={`${periodNote(
              data,
              data.previousTotals
                ? privacy.signed(data.previousTotals.subscribersNet, 'subscribers')
                : null,
            )} Le détail gagnés / perdus ne vient que des chaînes connectées en OAuth ; une chaîne publique ne donne que l'écart entre deux relevés.`}
          />
        ) : undefined
      }
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
      details={
        data ? (
          <StatDetails
            title="Temps de visionnage"
            rows={[
              {
                key: 'perView',
                label: 'Par vue en moyenne',
                value: privacy.isMasked('views')
                  ? privacy.count(0, 'views')
                  : data.totals.views > 0
                    ? `${((data.totals.watchHours * 60) / data.totals.views).toFixed(1)} min`
                    : '—',
              },
              {
                key: 'perDay',
                label: 'Par jour en moyenne',
                value: privacy.hours(data.totals.watchHours / days(data), 'views'),
              },
            ]}
            note={`${periodNote(
              data,
              data.previousTotals ? privacy.hours(data.previousTotals.watchHours, 'views') : null,
            )} Minutes regardées converties en heures, relevées par YouTube Analytics (chaînes OAuth seulement).`}
          />
        ) : undefined
      }
    />
  );
};

export const YouTubeEngagementCard = () => {
  const privacy = usePrivacy();
  const { data } = useAnalyticsData();
  const perThousand = (value: number) =>
    data && data.totals.views > 0 && !privacy.isMasked('views')
      ? `${((value / data.totals.views) * 1000).toFixed(1)} ‰ des vues`
      : undefined;
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
      details={
        data ? (
          <StatDetails
            title="Le grand chiffre compte les j'aime"
            rows={[
              {
                key: 'likes',
                label: "J'aime",
                sub: perThousand(data.totals.likes),
                value: privacy.count(data.totals.likes, 'views'),
              },
              {
                key: 'comments',
                label: 'Commentaires',
                sub: perThousand(data.totals.comments),
                value: privacy.count(data.totals.comments, 'views'),
              },
              {
                key: 'shares',
                label: 'Partages',
                sub: perThousand(data.totals.shares),
                value: privacy.count(data.totals.shares, 'views'),
              },
            ]}
            note={periodNote(
              data,
              data.previousTotals ? privacy.count(data.previousTotals.likes, 'views') : null,
            )}
          />
        ) : undefined
      }
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
  const newViews = data ? data.videoPerformance.reduce((sum, video) => sum + video.views, 0) : 0;
  const catalogViews = data ? Math.max(0, data.totals.views - newViews) : 0;
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
        data ? (
          <StatDetails
            title="Le calcul"
            rows={[
              {
                key: 'all',
                label: 'Vues de la période',
                value: privacy.count(data.totals.views, 'views'),
              },
              {
                key: 'new',
                operator: '−',
                label: 'Vues des sorties de la période',
                sub: `${data.videoPerformance.length} vidéo(s)`,
                value: privacy.count(newViews, 'views'),
              },
              {
                key: 'catalog',
                operator: '=',
                label: 'Vues du catalogue',
                value: privacy.count(catalogViews, 'views'),
              },
            ]}
            note="Une estimation : YouTube ne fournit les compteurs par vidéo qu'en cumul depuis la sortie, jamais jour par jour. Juste sur une période qui va jusqu'à aujourd'hui, approchée sur une période passée (planchée à zéro)."
          />
        ) : undefined
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
      channels: selected,
      subscribers: selected.reduce((sum, c) => sum + c.latestSnapshot!.subscribers, 0),
      views: selected.reduce((sum, c) => sum + c.latestSnapshot!.totalViews, 0),
      videos: selected.reduce((sum, c) => sum + c.latestSnapshot!.totalVideos, 0),
      hint: `depuis toujours · relevé du ${formatDate(date)}${
        selected.length > 1 ? ` · ${selected.length} chaînes` : ''
      }`,
    };
  }, [channels, filters.channelIds]);
};

type Lifetime = NonNullable<ReturnType<typeof useLifetime>>;
type Snapshot = NonNullable<Lifetime['channels'][number]['latestSnapshot']>;

/** Le dernier relevé de chaque chaîne retenue : c'est leur somme que la carte affiche. */
const LifetimeDetails = ({
  lifetime,
  pick,
  format,
  note,
}: {
  lifetime: Lifetime | null;
  pick: (snapshot: Snapshot) => number;
  format: (value: number) => string;
  note?: string;
}) => (
  <StatDetails
    title="Dernier relevé de chaque chaîne"
    rows={(lifetime?.channels ?? []).map((channel) => ({
      key: channel.id,
      label: channel.name,
      color: channel.color,
      sub: `relevé du ${formatDate(channel.latestSnapshot!.date)}`,
      value: format(pick(channel.latestSnapshot!)),
    }))}
    empty="Aucun relevé : la première collecte les posera."
    note={note ?? 'Compteurs publics de YouTube, hors période.'}
  />
);

export const YouTubeLifetimeSubscribersCard = () => {
  const privacy = usePrivacy();
  const lifetime = useLifetime();
  return (
    <StatCard
      label="Abonnés"
      value={lifetime ? privacy.count(lifetime.subscribers, 'subscribers') : '—'}
      hint={lifetime?.hint ?? 'aucun relevé'}
      icon={<Users className="h-4 w-4" />}
      details={
        <LifetimeDetails
          lifetime={lifetime}
          pick={(snapshot) => snapshot.subscribers}
          format={(value) => privacy.count(value, 'subscribers')}
          note="Au-delà de 1 000, YouTube arrondit le compte public à trois chiffres. Plusieurs chaînes sont additionnées : une même personne abonnée aux deux compte deux fois."
        />
      }
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
      details={
        <LifetimeDetails
          lifetime={lifetime}
          pick={(snapshot) => snapshot.totalViews}
          format={(value) => privacy.count(value, 'views')}
        />
      }
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
      details={
        <LifetimeDetails
          lifetime={lifetime}
          pick={(snapshot) => snapshot.totalVideos}
          format={formatNumber}
          note="Vidéos publiques de la chaîne, Shorts et directs compris."
        />
      }
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
