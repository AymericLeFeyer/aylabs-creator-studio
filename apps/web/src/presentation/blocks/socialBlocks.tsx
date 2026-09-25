import { Clapperboard, Heart, Music2, Users, Wifi } from 'lucide-react';
import {
  useDiscordHistory,
  useIntegrations,
} from '../../application/integration/usecases/useIntegrations.ts';
import { formatCount } from '../../domain/instagram/entities/Instagram.ts';
import { formatCount as formatTikTokCount } from '../../domain/tiktok/entities/TikTok.ts';
import { MASKED_TEXT } from '../../domain/privacy/entities/Privacy.ts';
import { formatDate, formatDateTime, formatNumber } from '../../shared/format.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { StatDetails } from '../components/StatDetails.tsx';
import { Card } from '../components/ui/card.tsx';
import { InstagramChart } from '../components/instagram/InstagramChart.tsx';
import { FollowersCard, ReachCard } from '../components/instagram/InstagramLinkedCharts.tsx';
import { PostsCalendar } from '../components/instagram/PostsCalendar.tsx';
import { LatestPostCard } from '../components/instagram/LatestPostCard.tsx';
import { TikTokChart } from '../components/tiktok/TikTokChart.tsx';
import { LatestTikTokCard } from '../components/tiktok/LatestTikTokCard.tsx';
import { DiscordChart } from '../components/discord/DiscordChart.tsx';
import { BlockHeading } from '../dashboard/BlockHeading.tsx';
import { useInstagramData, useTikTokData } from './blockData.ts';
import { BlockSkeleton } from './BlockSkeleton.tsx';

// --- Instagram ------------------------------------------------------------------------

/** Le meilleur jour d'une série : « 12 le 4 sept. ». */
const peak = <T extends { date: string }>(series: T[], pick: (point: T) => number | null) => {
  const best = series.reduce<T | null>(
    (top, point) => ((pick(point) ?? 0) > (top ? (pick(top) ?? 0) : 0) ? point : top),
    null,
  );
  return best ? `${formatNumber(pick(best) ?? 0)} le ${formatDate(best.date)}` : '—';
};

const periodLabel = (data: { from: string; to: string }) =>
  `Du ${formatDate(data.from)} au ${formatDate(data.to)}.`;

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
      details={
        data ? (
          <StatDetails
            title="Le rythme des stories"
            rows={[
              { key: 'total', label: 'Stories publiées', value: formatNumber(data.totals.stories) },
              {
                key: 'perDay',
                label: 'Par jour',
                sub: 'rapporté à tous les jours de la période',
                value: String(data.totals.storiesPerDay),
              },
              { key: 'perWeek', label: 'Par semaine', value: String(data.totals.storiesPerWeek) },
              {
                key: 'active',
                label: 'Jours avec au moins une',
                value: `${data.totals.activeDays} / ${data.totals.days}`,
              },
              { key: 'peak', label: 'Meilleur jour', value: peak(data.series, (p) => p.stories) },
            ]}
            note={`${periodLabel(data)} ${
              data.firstStoryDate
                ? `Archivées depuis le ${formatDate(data.firstStoryDate)} : avant, un zéro veut dire « pas collecté », pas « rien publié ».`
                : "Aucune story archivée pour l'instant."
            } Une story ne vit que 24 h dans l'API.`}
          />
        ) : undefined
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
      details={
        data ? (
          <StatDetails
            title={data.accounts.length > 1 ? 'Par compte, au dernier relevé' : 'Au dernier relevé'}
            rows={data.accounts.map((account) => ({
              key: account.id,
              label: `@${account.username}`,
              color: account.color,
              sub: account.latestSnapshot
                ? `relevé du ${formatDate(account.latestSnapshot.date)}`
                : 'aucun relevé',
              value: privacy.count(account.latestSnapshot?.followersCount ?? 0, 'subscribers'),
            }))}
            note={`${periodLabel(data)} Le gain compare le dernier relevé de la période à celui d'avant son début${
              data.previousTotals?.followersGained != null
                ? ` · période précédente : ${privacy.signed(data.previousTotals.followersGained, 'subscribers')}`
                : ''
            }.`}
          />
        ) : undefined
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
      details={
        data ? (
          <StatDetails
            title="Publications du profil, au dernier relevé"
            rows={[
              ...data.accounts.map((account) => ({
                key: account.id,
                label: `@${account.username}`,
                color: account.color,
                value: formatCount(account.latestSnapshot?.mediaCount ?? null),
              })),
              {
                key: 'period',
                label: 'Parues sur la période',
                sub: `meilleur jour : ${peak(data.series, (p) => p.posts)}`,
                value: formatNumber(data.totals.posts),
              },
            ]}
            note={`${periodLabel(data)} Le grand chiffre est le total du profil ; les stories n'y comptent pas.`}
          />
        ) : undefined
      }
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
      details={
        data ? (
          <StatDetails
            title="Comptes touchés"
            rows={[
              {
                key: 'perDay',
                label: 'Par jour en moyenne',
                value:
                  data.totals.reach == null
                    ? '—'
                    : formatNumber(Math.round(data.totals.reach / Math.max(1, data.totals.days))),
              },
              { key: 'peak', label: 'Meilleur jour', value: peak(data.series, (p) => p.reach) },
              { key: 'views', label: 'Vues', value: formatCount(data.totals.views) },
            ]}
            note={`${periodLabel(data)} Somme des portées quotidiennes : un même compte touché deux jours de suite compte deux fois. Meta ne garde que 90 jours.`}
          />
        ) : undefined
      }
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
      details={
        data ? (
          <StatDetails
            title="Interactions du compte"
            rows={[
              {
                key: 'perDay',
                label: 'Par jour en moyenne',
                value:
                  data.totals.totalInteractions == null
                    ? '—'
                    : formatNumber(
                        Math.round(data.totals.totalInteractions / Math.max(1, data.totals.days)),
                      ),
              },
              {
                key: 'peak',
                label: 'Meilleur jour',
                value: peak(data.series, (p) => p.totalInteractions),
              },
            ]}
            note={`${periodLabel(data)} Total de Meta (« total_interactions ») : j'aime, commentaires, partages et enregistrements, publications, reels et stories confondus.`}
          />
        ) : undefined
      }
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
      details={
        data ? (
          <StatDetails
            title={data.accounts.length > 1 ? 'Par compte, au dernier relevé' : 'Au dernier relevé'}
            rows={data.accounts.map((account) => ({
              key: account.id,
              label: `@${account.username}`,
              color: account.color,
              sub: account.latestSnapshot
                ? `relevé du ${formatDate(account.latestSnapshot.date)}`
                : 'aucun relevé',
              value: privacy.count(account.latestSnapshot?.followersCount ?? 0, 'subscribers'),
            }))}
            note={`${periodLabel(data)} Relevé une fois par jour sur le profil public. Le gain compare le dernier relevé de la période à celui d'avant son début.`}
          />
        ) : undefined
      }
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
      details={
        data ? (
          <StatDetails
            title="Coeurs reçus depuis toujours"
            rows={data.accounts.map((account) => ({
              key: account.id,
              label: `@${account.username}`,
              color: account.color,
              sub: account.latestSnapshot
                ? `relevé du ${formatDate(account.latestSnapshot.date)}`
                : 'aucun relevé',
              value: formatTikTokCount(account.latestSnapshot?.heartCount ?? null),
            }))}
            note="Total public du profil (toutes vidéos), pas le gain de la période."
          />
        ) : undefined
      }
    />
  );
};

/**
 * Le total vient du profil (`videoCount`, vidéos privées exclues) : c'est le seul chiffre
 * exact, `tiktok_videos` n'archivant que les dix dernières à chaque relevé. La période,
 * elle, se compte dans ces vidéos archivées — juste tant qu'on publie moins de dix vidéos
 * entre deux relevés quotidiens, et seulement depuis la première collecte.
 */
export const TikTokVideosCard = () => {
  const { data } = useTikTokData();
  const counts = data?.accounts
    .map((account) => account.latestSnapshot?.videoCount)
    .filter((count): count is number => count != null);
  const total = counts?.length ? counts.reduce((sum, count) => sum + count, 0) : null;
  const period = data?.totals.videos ?? 0;
  return (
    <StatCard
      label="Publications TikTok"
      value={formatTikTokCount(total)}
      hint={`${period > 0 ? '+' : ''}${period} publiée${period > 1 ? 's' : ''} sur la période`}
      icon={<Clapperboard className="h-4 w-4" />}
      details={
        data ? (
          <StatDetails
            title={data.accounts.length > 1 ? 'Par compte, au dernier relevé' : 'Au dernier relevé'}
            rows={data.accounts.map((account) => ({
              key: account.id,
              label: `@${account.username}`,
              color: account.color,
              sub: account.latestSnapshot
                ? `relevé du ${formatDate(account.latestSnapshot.date)}`
                : 'aucun relevé',
              value: formatTikTokCount(account.latestSnapshot?.videoCount ?? null),
            }))}
            note={`${periodLabel(data)} Total public du profil, vidéos privées exclues. Les publications de la période sont comptées depuis la première collecte.`}
          />
        ) : undefined
      }
    />
  );
};

/** Hors période (`latestVideos`) : « ma dernière vidéo marche comment ». */
export const TikTokLatestVideos = () => {
  const { data } = useTikTokData();
  if (!data) return <BlockSkeleton className="h-28" />;
  // Pas de retour à vide muet : un bloc qui disparaît se lit comme un bloc qui n'existe pas.
  if (data.latestVideos.length === 0) {
    return data.accounts.length === 0 ? null : (
      <Card className="p-4 text-sm text-muted-foreground">
        Aucune vidéo TikTok relevée pour l’instant : les dix dernières arrivent avec la prochaine
        collecte du profil (une par jour, ou « Collecter » en haut de l’écran).
      </Card>
    );
  }
  return <LatestTikTokCard videos={data.latestVideos} accounts={data.accounts} />;
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

const useDiscordLastUpdate = () => {
  const { data } = useIntegrations();
  return data?.providers.find((provider) => provider.id === 'discord')?.lastUpdate ?? null;
};

const DiscordDetails = ({ payload, note }: { payload: DiscordData | null; note: string }) => {
  const lastUpdate = useDiscordLastUpdate();
  return (
    <StatDetails
      title={payload?.name ?? 'Serveur Discord'}
      rows={[
        {
          key: 'members',
          label: 'Membres',
          value: payload?.members != null ? formatNumber(payload.members) : '—',
        },
        {
          key: 'online',
          label: 'En ligne',
          sub:
            payload?.members && payload.members_online != null
              ? `${Math.round((payload.members_online / payload.members) * 100)} % des membres`
              : undefined,
          value: payload?.members_online != null ? formatNumber(payload.members_online) : '—',
        },
      ]}
      note={`${note} ${lastUpdate ? `Dernier relevé : ${formatDateTime(lastUpdate)}.` : 'Jamais relevé.'}`}
    />
  );
};

export const DiscordMembersCard = () => {
  const payload = useDiscordData();
  return (
    <StatCard
      label="Membres Discord"
      value={payload?.members != null ? formatNumber(payload.members) : '—'}
      hint="total du serveur"
      icon={<Users className="h-4 w-4" />}
      details={
        <DiscordDetails
          payload={payload}
          note="Compteurs de l'invitation publique du serveur, relevés chaque heure."
        />
      }
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
      details={
        <DiscordDetails
          payload={payload}
          note="Une photo à l'instant du relevé : le nombre varie d'une heure à l'autre."
        />
      }
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
