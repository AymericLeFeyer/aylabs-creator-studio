import type { ReactNode } from 'react';
import type { ProductionFormat } from '../../domain/production/entities/Production.ts';
import type { Channel } from '../../domain/channel/entities/Channel.ts';
import * as yt from '../blocks/youtubeBlocks.tsx';
import * as money from '../blocks/moneyBlocks.tsx';
import * as partner from '../blocks/partnerBlocks.tsx';
import * as social from '../blocks/socialBlocks.tsx';
import * as prod from '../blocks/productionBlocks.tsx';
import * as legal from '../blocks/legalBlocks.tsx';
import * as comment from '../blocks/commentBlocks.tsx';
import * as achievement from '../blocks/achievementBlocks.tsx';
import {
  DomadooChartBlock,
  DomadooMetricCard,
  DomadooSalesBlock,
} from '../blocks/domadooBlocks.tsx';
import { DOMADOO_ROWS, DOMADOO_WINDOWS } from '../blocks/domadooRows.ts';
import {
  AmazonChartBlock,
  AmazonFunnelBlock,
  AmazonMetricCard,
  AmazonMonthsBlock,
} from '../blocks/amazonBlocks.tsx';
import { AMAZON_METRICS } from '../blocks/amazonMetrics.ts';
import { PRODUCTION_COPY } from '../blocks/productionCopy.ts';
import { UpcomingExpensesCard } from '../components/money/UpcomingExpensesCard.tsx';
import { RevenuesPanel } from '../components/money/RevenuesPanel.tsx';
import { ExpensesPanel } from '../components/money/ExpensesPanel.tsx';
import { RecurringExpensesPanel } from '../components/money/RecurringExpensesPanel.tsx';
import {
  BrandRanking,
  ChannelSplit,
  ExpenseSplit,
  RevenueSplit,
  SponsorRanking,
} from '../components/money/MoneyBreakdowns.tsx';
import { PlatformsPanel } from '../components/partners/PlatformsPanel.tsx';
import { ProductsTable } from '../components/partners/ProductsTable.tsx';
import { SponsorshipsTable } from '../components/partners/SponsorshipsTable.tsx';

/**
 * Le **catalogue des blocs** : tout ce qui peut se poser sur le dashboard.
 *
 * Un bloc est **autonome** — il va chercher ses données lui-même (`blocks/blockData.ts`) —
 * et vit à deux endroits à la fois : sa page d'origine, qui le monte par `<Block id>`, et
 * le dashboard, qui le monte par l'identifiant stocké en base. Un seul composant pour les
 * deux, si bien qu'un bloc ne peut pas se lire différemment selon l'écran.
 *
 * **L'identifiant est un contrat stocké** (`dashboard_widgets.block_id`) : le renommer ici
 * fait disparaître le bloc des dashboards où il était posé. Un identifiant inconnu est
 * ignoré à l'affichage, jamais une erreur.
 *
 * Ce fichier n'exporte aucun composant (`react-refresh/only-export-components`).
 */
export interface BlockDefinition {
  /** Nom dans le catalogue et titre d'origine dans l'éditeur. */
  label: string;
  /** La page d'origine, pour ranger le catalogue et y renvoyer. */
  group: string;
  /** Colonnes occupées à l'ajout, sur une grille de 6. */
  width: number;
  render: () => ReactNode;
}

const METRIC = 1;
const HALF = 3;
const FULL = 6;

const productionBlocks = (format: ProductionFormat): Record<string, BlockDefinition> => {
  const group = PRODUCTION_COPY[format].group;
  const stat = (key: prod.ProductionStatKey, label: string): BlockDefinition => ({
    label: `${label} (${group})`,
    group,
    width: METRIC,
    render: () => <prod.ProductionStatCard format={format} stat={key} />,
  });
  return {
    [`production.${format}.inQueue`]: stat('inQueue', 'En cours'),
    [`production.${format}.progress`]: stat('progress', 'Avancement moyen'),
    [`production.${format}.next`]: stat('next', 'Prochaine sortie'),
    [`production.${format}.week`]: stat('week', 'Temps cette semaine'),
    [`production.${format}.late`]: stat('late', 'En retard'),
    [`production.${format}.paused`]: stat('paused', 'Bloquées'),
    [`production.${format}.gantt`]: {
      label: `Planning (${group})`,
      group,
      width: FULL,
      render: () => <prod.ProductionGanttBlock format={format} />,
    },
    [`production.${format}.queue`]: {
      label: `File d'attente (${group})`,
      group,
      width: 4,
      render: () => <prod.ProductionQueueBlock format={format} />,
    },
    [`production.${format}.slots`]: {
      label: `Prochains créneaux (${group})`,
      group,
      width: 2,
      render: () => <prod.UpcomingSlotsBlock format={format} />,
    },
    [`production.${format}.averages`]: {
      label: `Temps par étape (${group})`,
      group,
      width: 2,
      render: () => <prod.StepAveragesBlock format={format} />,
    },
    [`production.${format}.ideas`]: {
      label: `Carnet d'idées (${group})`,
      group,
      width: 2,
      render: () => <prod.IdeaBoxBlock format={format} />,
    },
    [`production.${format}.done`]: {
      label: `Terminées (${group})`,
      group,
      width: FULL,
      render: () => <prod.ProductionDoneBlock format={format} />,
    },
  };
};

const amazonBlocks = Object.fromEntries(
  AMAZON_METRICS.map((metric): [string, BlockDefinition] => [
    `amazon.${metric.id}`,
    {
      label: `Amazon · ${metric.label}`,
      group: 'Affiliations',
      width: METRIC,
      render: () => <AmazonMetricCard metricId={metric.id} />,
    },
  ]),
);

const domadooBlocks = Object.fromEntries(
  DOMADOO_ROWS.map((row): [string, BlockDefinition] => [
    `domadoo.${row.id}`,
    {
      label: `Domadoo · ${row.label} (${DOMADOO_WINDOWS[row.window].toLowerCase()})`,
      group: 'Affiliations',
      width: METRIC,
      render: () => <DomadooMetricCard rowId={row.id} />,
    },
  ]),
);

const metric = (label: string, group: string, render: () => ReactNode): BlockDefinition => ({
  label,
  group,
  width: METRIC,
  render,
});
const panel = (
  label: string,
  group: string,
  width: number,
  render: () => ReactNode,
): BlockDefinition => ({ label, group, width, render });

export const BLOCKS: Record<string, BlockDefinition> = {
  // --- YouTube ---
  'youtube.views': metric('Vues', 'YouTube', () => <yt.YouTubeViewsCard />),
  'youtube.subscribers': metric('Abonnés gagnés', 'YouTube', () => <yt.YouTubeSubscribersCard />),
  'youtube.watchHours': metric('Heures vues', 'YouTube', () => <yt.YouTubeWatchHoursCard />),
  'youtube.engagement': metric('Engagement', 'YouTube', () => <yt.YouTubeEngagementCard />),
  'youtube.videosPublished': metric('Vidéos publiées', 'YouTube', () => (
    <yt.YouTubeVideosPublishedCard />
  )),
  'youtube.catalogViews': metric('Vues du catalogue', 'YouTube', () => (
    <yt.YouTubeCatalogViewsCard />
  )),
  'youtube.lifetime.subscribers': metric('Abonnés (toutes chaînes cumulées)', 'YouTube', () => (
    <yt.YouTubeLifetimeSubscribersCard />
  )),
  'youtube.lifetime.views': metric('Vues au total (toutes chaînes cumulées)', 'YouTube', () => (
    <yt.YouTubeLifetimeViewsCard />
  )),
  'youtube.lifetime.videos': metric('Vidéos au total', 'YouTube', () => (
    <yt.YouTubeLifetimeVideosCard />
  )),
  'youtube.latest': panel('Dernières sorties', 'YouTube', FULL, () => <yt.YouTubeLatestVideos />),
  'youtube.audience': panel('Audience', 'YouTube', HALF, () => <yt.YouTubeAudienceChart />),
  'youtube.ranking': panel('Classement des vidéos', 'YouTube', HALF, () => <yt.YouTubeRanking />),
  'youtube.periodTable': panel('Sorties de la période', 'YouTube', FULL, () => (
    <yt.YouTubePeriodTable />
  )),
  'youtube.catalog': panel('Catalogue', 'YouTube', FULL, () => <yt.YouTubeCatalogTable />),

  // --- Instagram ---
  'instagram.stories': metric('Stories', 'Instagram', () => <social.InstagramStoriesCard />),
  'instagram.followers': metric('Abonnés Instagram', 'Instagram', () => (
    <social.InstagramFollowersCard />
  )),
  'instagram.posts': metric('Publications', 'Instagram', () => <social.InstagramPostsCard />),
  'instagram.reach': metric('Portée', 'Instagram', () => <social.InstagramReachCard />),
  'instagram.interactions': metric('Interactions', 'Instagram', () => (
    <social.InstagramInteractionsCard />
  )),
  'instagram.latest': panel('Dernières publications', 'Instagram', FULL, () => (
    <social.InstagramLatestPosts />
  )),
  'instagram.followersChart': panel('Courbe des abonnés', 'Instagram', HALF, () => (
    <social.InstagramFollowersChart />
  )),
  'instagram.reachChart': panel('Courbe de portée', 'Instagram', HALF, () => (
    <social.InstagramReachChart />
  )),
  'instagram.activity': panel('Activité (onglets)', 'Instagram', FULL, () => (
    <social.InstagramActivityChart />
  )),
  'instagram.calendar': panel('Calendrier des publications', 'Instagram', FULL, () => (
    <social.InstagramCalendar />
  )),

  // --- TikTok ---
  'tiktok.followers': metric('Abonnés TikTok', 'TikTok', () => <social.TikTokFollowersCard />),
  'tiktok.hearts': metric('Coeurs', 'TikTok', () => <social.TikTokHeartsCard />),
  'tiktok.videos': metric('Publications TikTok', 'TikTok', () => <social.TikTokVideosCard />),
  'tiktok.latest': panel('Dernières vidéos TikTok', 'TikTok', FULL, () => (
    <social.TikTokLatestVideos />
  )),
  'tiktok.chart': panel('Graphique TikTok', 'TikTok', FULL, () => <social.TikTokChartBlock />),

  // --- Discord ---
  'discord.members': metric('Membres Discord', 'Discord', () => <social.DiscordMembersCard />),
  'discord.online': metric('En ligne sur Discord', 'Discord', () => <social.DiscordOnlineCard />),
  'discord.chart': panel('Évolution Discord', 'Discord', HALF, () => <social.DiscordChartBlock />),

  // --- Achievements ---
  'achievements.recent': panel('Derniers paliers franchis', 'Achievements', HALF, () => (
    <achievement.AchievementsRecentBlock />
  )),
  'achievements.next': panel('Prochains paliers', 'Achievements', HALF, () => (
    <achievement.AchievementsNextBlock />
  )),
  'achievements.records': panel('Records', 'Achievements', FULL, () => (
    <achievement.AchievementsRecordsBlock />
  )),

  // --- Commentaires ---
  'comments.toSort': metric('Commentaires à trier', 'Commentaires', () => (
    <comment.CommentsToSortCard />
  )),
  'comments.wall': panel('Wall of Love', 'Commentaires', FULL, () => <comment.WallOfLoveBlock />),
  'comments.ideas': panel('Propositions de la communauté', 'Commentaires', FULL, () => (
    <comment.CommunityIdeasBlock />
  )),

  // --- Production ---
  'production.all.queue': metric('En production', 'Vidéos', () => (
    <prod.ProductionQueueCountCard />
  )),
  ...productionBlocks('video'),
  ...productionBlocks('short'),

  // --- Produits ---
  'products.pending': metric('Produits attendus', 'Produits', () => (
    <partner.ProductsPendingCard />
  )),
  'products.pendingValue': metric('Valeur attendue', 'Produits', () => (
    <partner.ProductsPendingValueCard />
  )),
  'products.received': metric('Produits reçus sur la période', 'Produits', () => (
    <partner.ProductsReceivedCard />
  )),
  'products.toShoot': metric('À tourner', 'Produits', () => <partner.ProductsToShootCard />),
  'products.table': panel('Table des produits', 'Produits', FULL, () => <ProductsTable />),

  // --- Sponsors ---
  'sponsors.awaiting': metric('Paiements en attente', 'Sponsors', () => (
    <partner.SponsorsAwaitingCard />
  )),
  'sponsors.toDeliver': metric('À livrer', 'Sponsors', () => <partner.SponsorsToDeliverCard />),
  'sponsors.pending': metric('Sponsos à encaisser', 'Sponsors', () => (
    <partner.SponsorsPendingCard />
  )),
  'sponsors.paid': metric('Encaissées sur la période', 'Sponsors', () => (
    <partner.SponsorsPaidCard />
  )),
  'sponsors.table': panel('Table des sponsos', 'Sponsors', FULL, () => <SponsorshipsTable />),

  // --- Affiliations ---
  'domadoo.chart': panel('Évolution Domadoo', 'Affiliations', FULL, () => <DomadooChartBlock />),
  'domadoo.sales': panel('Ventes récentes Domadoo', 'Affiliations', FULL, () => (
    <DomadooSalesBlock />
  )),
  ...domadooBlocks,
  'amazon.chart': panel('Évolution Amazon', 'Affiliations', FULL, () => <AmazonChartBlock />),
  'amazon.funnel': panel('Amazon · Du clic à la commission', 'Affiliations', HALF, () => (
    <AmazonFunnelBlock />
  )),
  'amazon.months': panel('Amazon · Mois par mois', 'Affiliations', HALF, () => (
    <AmazonMonthsBlock />
  )),
  ...amazonBlocks,
  'affiliation.total': metric('Total affiliations', 'Affiliations', () => (
    <partner.AffiliationTotalCard />
  )),
  'affiliation.unlinked': metric('Sans plateforme', 'Affiliations', () => (
    <partner.AffiliationUnlinkedCard />
  )),
  'affiliation.best': metric('Plateforme en tête', 'Affiliations', () => (
    <partner.AffiliationBestCard />
  )),
  'affiliation.platforms': metric('Plateformes suivies', 'Affiliations', () => (
    <partner.AffiliationPlatformsCard />
  )),
  'affiliation.panel': panel('Plateformes d’affiliation', 'Affiliations', FULL, () => (
    <PlatformsPanel />
  )),

  // --- Chiffre d'affaires ---
  'money.headline': metric('CA ou bénéfices (selon l’interrupteur)', "Chiffre d'affaires", () => (
    <money.MoneyHeadlineCard />
  )),
  'money.gross': metric("Chiffre d'affaires", "Chiffre d'affaires", () => (
    <money.GrossRevenueCard />
  )),
  'money.profit': metric('Bénéfices', "Chiffre d'affaires", () => <money.ProfitCard />),
  'money.expenses': metric('Dépenses', "Chiffre d'affaires", () => <money.ExpensesCard />),
  'money.inKindCount': metric('Produits reçus (nombre)', "Chiffre d'affaires", () => (
    <money.InKindCountCard />
  )),
  'money.inKindValue': metric('Produits reçus (valeur)', "Chiffre d'affaires", () => (
    <money.InKindValueCard />
  )),
  'money.upcoming': metric('À venir', "Chiffre d'affaires", () => <UpcomingExpensesCard />),
  'money.chart': panel("Graphique d'argent", "Chiffre d'affaires", HALF, () => (
    <money.MoneyChartBlock />
  )),
  'money.revenueSplit': panel('Répartition des revenus', "Chiffre d'affaires", 2, () => (
    <RevenueSplit />
  )),
  'money.expenseSplit': panel('Répartition des dépenses', "Chiffre d'affaires", 2, () => (
    <ExpenseSplit />
  )),
  'money.channelSplit': panel('Revenus par chaîne', "Chiffre d'affaires", 2, () => (
    <ChannelSplit />
  )),
  'money.brandRanking': panel('Marques les plus généreuses', "Chiffre d'affaires", HALF, () => (
    <BrandRanking />
  )),
  'money.sponsorRanking': panel('Sponsors qui paient le plus', "Chiffre d'affaires", HALF, () => (
    <SponsorRanking />
  )),
  'money.revenues': panel('Table des revenus', "Chiffre d'affaires", FULL, () => <RevenuesPanel />),
  'money.expensesTable': panel('Table des dépenses', "Chiffre d'affaires", FULL, () => (
    <ExpensesPanel />
  )),
  'money.recurring': panel('Dépenses récurrentes', "Chiffre d'affaires", FULL, () => (
    <RecurringExpensesPanel />
  )),

  // --- Légal ---
  'legal.company': panel('Fiche société', 'Légal', HALF, () => <legal.CompanyBlock />),
  'legal.done': metric('Cases cochées', 'Légal', () => <legal.LegalDoneCard />),
  'legal.late': metric('Obligations en retard', 'Légal', () => <legal.LegalLateCard />),
  'legal.bookmarks': panel('Liens utiles', 'Légal', FULL, () => <legal.LegalBookmarksBlock />),
  'legal.table': panel('Tableau mensuel', 'Légal', FULL, () => <legal.LegalTableBlock />),
};

/**
 * Les blocs **par chaîne** : abonnés et vues au total d'une seule chaîne. Leur identifiant
 * porte celui de la chaîne (`youtube.channel.<id>.subscribers`), si bien qu'ils ne
 * peuvent pas vivre dans `BLOCKS`, liste fixe : `resolveBlock` les reconnaît au motif.
 * Supprimer la chaîne fait disparaître le bloc du dashboard (il se rend vide), sans erreur.
 */
const CHANNEL_METRICS = {
  subscribers: 'Abonnés',
  views: 'Vues au total',
} as const;
type ChannelMetric = keyof typeof CHANNEL_METRICS;

const CHANNEL_BLOCK = /^youtube\.channel\.(.+)\.(subscribers|views)$/;

export const channelBlockId = (channelId: string, kind: ChannelMetric) =>
  `youtube.channel.${channelId}.${kind}`;

/** Sans nom (dashboard), le libellé reste générique : la carte affiche la chaîne elle-même. */
const channelBlock = (channelId: string, kind: ChannelMetric, name?: string): BlockDefinition =>
  metric(
    name ? `${CHANNEL_METRICS[kind]} · ${name}` : `${CHANNEL_METRICS[kind]} (une chaîne)`,
    'YouTube',
    () => <yt.YouTubeChannelLifetimeCard channelId={channelId} metric={kind} />,
  );

/** Le bloc d'un identifiant : le catalogue fixe, puis les motifs par chaîne. */
export const resolveBlock = (id: string): BlockDefinition | undefined => {
  if (BLOCKS[id]) return BLOCKS[id];
  const match = CHANNEL_BLOCK.exec(id);
  return match ? channelBlock(match[1]!, match[2] as ChannelMetric) : undefined;
};

/** Les blocs par chaîne à proposer dans le catalogue, une paire par chaîne active. */
export const channelBlocks = (channels: Channel[]): Array<[string, BlockDefinition]> =>
  channels
    .filter((channel) => !channel.isArchived)
    .flatMap((channel) =>
      (Object.keys(CHANNEL_METRICS) as ChannelMetric[]).map((kind): [string, BlockDefinition] => [
        channelBlockId(channel.id, kind),
        channelBlock(channel.id, kind, channel.name),
      ]),
    );
