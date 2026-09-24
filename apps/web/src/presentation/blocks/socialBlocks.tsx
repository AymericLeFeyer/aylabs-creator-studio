import { Heart, Music2, Users, Wifi } from 'lucide-react';
import {
  useDiscordHistory,
  useIntegrations,
} from '../../application/integration/usecases/useIntegrations.ts';
import { formatCount } from '../../domain/instagram/entities/Instagram.ts';
import { formatCount as formatTikTokCount } from '../../domain/tiktok/entities/TikTok.ts';
import { MASKED_TEXT } from '../../domain/privacy/entities/Privacy.ts';
import { formatNumber } from '../../shared/format.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { Card } from '../components/ui/card.tsx';
import { InstagramChart } from '../components/instagram/InstagramChart.tsx';
import { FollowersCard, ReachCard } from '../components/instagram/InstagramLinkedCharts.tsx';
import { PostsCalendar } from '../components/instagram/PostsCalendar.tsx';
import { LatestPostCard } from '../components/instagram/LatestPostCard.tsx';
import { TikTokChart } from '../components/tiktok/TikTokChart.tsx';
import { DiscordChart } from '../components/discord/DiscordChart.tsx';
import { BlockHeading } from '../dashboard/BlockHeading.tsx';
import { useInstagramData, useTikTokData } from './blockData.ts';
import { BlockSkeleton } from './BlockSkeleton.tsx';

// --- Instagram ------------------------------------------------------------------------

export const InstagramStoriesCard = () => {
  const { data } = useInstagramData();
  const totals = data?.totals;
  return (
    <StatCard
      label="Stories"
      value={formatCount(totals?.stories ?? null)}
      hint={
        totals
          ? `${totals.storiesPerDay} par jour · ${totals.activeDays} jour(s) avec au moins une`
          : 'Archivées à la collecte horaire'
      }
    />
  );
};

export const InstagramFollowersCard = () => {
  const privacy = usePrivacy();
  const { data } = useInstagramData();
  const totals = data?.totals;
  const masked = privacy.isMasked('subscribers');
  return (
    <StatCard
      label="Abonnés Instagram"
      value={masked ? MASKED_TEXT : formatCount(totals?.followers ?? null)}
      hint={
        masked
          ? 'Gain masqué'
          : totals?.followersGained == null
            ? 'Pas encore de point de comparaison'
            : `${totals.followersGained >= 0 ? '+' : ''}${totals.followersGained} sur la période`
      }
    />
  );
};

/**
 * Le total du profil en grand : c'est le chiffre qu'on connaît toujours. Le nombre de
 * parutions de la période ne se compte qu'à partir des publications datées.
 */
export const InstagramPostsCard = () => {
  const { data } = useInstagramData();
  const profilePosts = (data?.accounts ?? []).reduce<number | null>((sum, account) => {
    const count = account.latestSnapshot?.mediaCount;
    return count == null ? sum : (sum ?? 0) + count;
  }, null);
  return (
    <StatCard
      label="Publications"
      value={formatCount(profilePosts ?? data?.totals.posts ?? null)}
      hint={`${formatCount(data?.totals.posts ?? 0)} parue(s) sur la période`}
    />
  );
};

export const InstagramReachCard = () => {
  const { data } = useInstagramData();
  return (
    <StatCard
      label="Portée"
      value={formatCount(data?.totals.reach ?? null)}
      hint="comptes touchés sur la période"
    />
  );
};

export const InstagramInteractionsCard = () => {
  const { data } = useInstagramData();
  return (
    <StatCard
      label="Interactions"
      value={formatCount(data?.totals.totalInteractions ?? null)}
      hint="j’aime, commentaires, partages, enregistrements"
    />
  );
};

export const InstagramFollowersChart = () => {
  const { data } = useInstagramData();
  return data ? <FollowersCard data={data} /> : <BlockSkeleton />;
};

export const InstagramReachChart = () => {
  const { data } = useInstagramData();
  return data ? <ReachCard data={data} /> : <BlockSkeleton />;
};

export const InstagramActivityChart = () => {
  const { data } = useInstagramData();
  return (
    <Card className="space-y-2 p-4">
      <BlockHeading />
      <InstagramChart series={data?.series ?? []} />
    </Card>
  );
};

export const InstagramCalendar = () => {
  const filters = useFilters();
  const { data } = useInstagramData();
  return (
    <Card className="space-y-2 p-4">
      <BlockHeading title="Publications" />
      <PostsCalendar
        series={data?.series ?? []}
        media={data?.media ?? []}
        from={filters.from}
        to={filters.to}
      />
    </Card>
  );
};

/** Hors période (`latestMedia`) : « ma dernière publication marche comment ». */
export const InstagramLatestPosts = () => {
  const { data } = useInstagramData();
  if (!data) return <BlockSkeleton className="h-28" />;
  if (data.latestMedia.length === 0) return null;
  return <LatestPostCard media={data.latestMedia} accounts={data.accounts} />;
};

// --- TikTok ---------------------------------------------------------------------------

export const TikTokFollowersCard = () => {
  const privacy = usePrivacy();
  const { data } = useTikTokData();
  const totals = data?.totals;
  const masked = privacy.isMasked('subscribers');
  return (
    <StatCard
      label="Abonnés TikTok"
      value={masked ? MASKED_TEXT : formatTikTokCount(totals?.followers ?? null)}
      hint={
        masked
          ? 'Gain masqué'
          : totals?.followersGained == null
            ? 'Pas encore de point de comparaison'
            : `${totals.followersGained >= 0 ? '+' : ''}${totals.followersGained} sur la période`
      }
      icon={<Music2 className="h-4 w-4" />}
    />
  );
};

export const TikTokHeartsCard = () => {
  const { data } = useTikTokData();
  return (
    <StatCard
      label="Coeurs"
      value={formatTikTokCount(data?.totals.hearts ?? null)}
      hint="au dernier relevé"
      icon={<Heart className="h-4 w-4" />}
    />
  );
};

export const TikTokChartBlock = () => {
  const { data } = useTikTokData();
  return (
    <Card className="space-y-2 p-4">
      <BlockHeading />
      <TikTokChart series={data?.series ?? []} />
    </Card>
  );
};

// --- Discord --------------------------------------------------------------------------

interface DiscordData {
  name: string;
  members: number | null;
  members_online: number | null;
}

const useDiscordData = () => {
  const { data } = useIntegrations();
  const discord = data?.providers.find((provider) => provider.id === 'discord');
  return (discord?.data ?? null) as DiscordData | null;
};

export const DiscordMembersCard = () => {
  const payload = useDiscordData();
  return (
    <StatCard
      label="Membres Discord"
      value={payload?.members != null ? formatNumber(payload.members) : '—'}
      hint="total du serveur"
      icon={<Users className="h-4 w-4" />}
    />
  );
};

export const DiscordOnlineCard = () => {
  const payload = useDiscordData();
  return (
    <StatCard
      label="En ligne"
      value={payload?.members_online != null ? formatNumber(payload.members_online) : '—'}
      hint="connectés au dernier relevé"
      icon={<Wifi className="h-4 w-4" />}
    />
  );
};

export const DiscordChartBlock = () => {
  const filters = useFilters();
  const { data: history = [] } = useDiscordHistory({ from: filters.from, to: filters.to });
  return (
    <Card className="space-y-2 p-4">
      <BlockHeading
        title="Évolution"
        description="Sur la période choisie — un point par collecte, pas par jour."
      />
      <DiscordChart snapshots={history} />
    </Card>
  );
};
