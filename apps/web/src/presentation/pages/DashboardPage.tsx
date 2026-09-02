import { useMemo } from 'react';
import {
  Clock,
  Eye,
  Gift,
  Handshake,
  Heart,
  PackageOpen,
  Receipt,
  Users,
  Video,
  Wallet,
} from 'lucide-react';
import { useAnalytics } from '../../application/analytics/usecases/useAnalytics.ts';
import { useChannels } from '../../application/channel/usecases/useChannels.ts';
import { useRevenues } from '../../application/revenue/usecases/useRevenues.ts';
import { useProducts } from '../../application/product/usecases/useProducts.ts';
import { useSponsorships } from '../../application/sponsorship/usecases/useSponsorships.ts';
import {
  useProductionOverview,
  useProductionSteps,
} from '../../application/production/usecases/useProductions.ts';
import { useLegalOverview } from '../../application/legal/usecases/useLegal.ts';
import { partnerPipeline } from '../../domain/partner/services/pipeline.ts';
import { useAnalyticsParams, useFilters } from '../hooks/useFilters.tsx';
import {
  cashRevenue,
  compareTotals,
  moneyValue,
} from '../../domain/analytics/services/revenueMath.ts';
import { NATURE_LABELS } from '../../domain/category/entities/Category.ts';
import {
  formatHours,
  formatMoney,
  formatNumber,
  formatSigned,
  toIsoDate,
} from '../../shared/format.ts';
import { StatCard } from '../components/StatCard.tsx';
import { InKindList, VideoList } from '../components/StatCardLists.tsx';
import { MoneyChart } from '../components/charts/MoneyChart.tsx';
import { AudienceChart } from '../components/charts/AudienceChart.tsx';
import { AlertsBanner } from '../components/production/AlertsBanner.tsx';
import { ProductionQueueCard } from '../components/production/ProductionQueueCard.tsx';
import { LegalAlertsCard } from '../components/legal/LegalAlertsCard.tsx';
import { EmptyState } from '../components/EmptyState.tsx';

/**
 * Le tableau de bord : ce qu'il faut savoir de chaque onglet, sans en ouvrir aucun.
 *
 * Il ne garde que **deux graphiques** — l'argent et l'audience, côte à côte et à survol
 * synchronisé. Les répartitions, les classements de partenaires et le tableau de
 * performance vivent désormais dans les onglets Chiffre d'affaires et Contenu : les
 * empiler ici faisait une page qu'on parcourait au lieu de la lire.
 *
 * Ce qui reste tient en un écran et demi : les chiffres de la période, ce qui cloche
 * (production et administratif), et l'état des deux files qui n'ont pas de période —
 * les vidéos en cours et le pipeline de partenariats.
 */
export const DashboardPage = () => {
  const filters = useFilters();
  const params = useAnalyticsParams();
  const { data, isLoading, error } = useAnalytics(params);
  const { data: channels = [], isLoading: channelsLoading } = useChannels();

  // Le détail des produits reçus n'est pas dans `analytics`, qui n'expose que des
  // agrégats : on relit la liste des revenus, bornée exactement comme le dashboard.
  const { data: revenues = [] } = useRevenues({
    from: filters.from,
    to: filters.to,
    channelIds: filters.channelIds,
  });
  const inKindEntries = useMemo(
    () => revenues.filter((entry) => entry.categoryNature === 'in_kind'),
    [revenues],
  );

  // Le pipeline n'est **pas** borné par la période : une sponso signée en mars et pas
  // encore payée reste à encaisser en juin. C'est un état, pas un flux.
  const { data: products = [] } = useProducts();
  const { data: sponsorships = [] } = useSponsorships();
  const pipeline = useMemo(
    () => partnerPipeline(products, sponsorships, toIsoDate(new Date())),
    [products, sponsorships],
  );

  const { data: production } = useProductionOverview();
  const { data: steps = [] } = useProductionSteps();
  const { data: legal } = useLegalOverview();

  const moneyOptions = { mode: filters.moneyMode, includeInKind: filters.includeInKind };

  if (!channelsLoading && channels.length === 0) {
    return (
      <EmptyState
        title="Aucune chaîne suivie"
        description="Ajoute une première chaîne pour commencer à enregistrer tes statistiques dans le temps."
        actionLabel="Ajouter une chaîne"
        actionTo="/chaines"
      />
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {error instanceof Error ? error.message : 'Erreur de chargement des statistiques'}
        </div>
      )}

      {isLoading && !data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-xl border border-border bg-card"
            />
          ))}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <StatCard
              label={filters.moneyMode === 'profit' ? 'Bénéfices' : "Chiffre d'affaires"}
              value={formatMoney(moneyValue(data.totals, moneyOptions))}
              change={compareTotals(data.totals, data.previousTotals, (totals) =>
                moneyValue(totals, moneyOptions),
              )}
              hint={`dont ${formatMoney(cashRevenue(data.totals))} encaissés`}
              icon={<Wallet className="h-4 w-4" />}
            />
            <StatCard
              label="Vues"
              value={formatNumber(data.totals.views)}
              change={compareTotals(data.totals, data.previousTotals, (t) => t.views)}
              icon={<Eye className="h-4 w-4" />}
            />
            {/* Le gain en gros, le total en petit : sur une période, ce qui se pilote
                c'est la progression — le cumul, lui, ne bouge qu'à la marge. */}
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
              accent={data.totals.subscribersNet < 0 ? 'var(--color-negative)' : undefined}
            />
            <StatCard
              label="Heures vues"
              value={formatHours(data.totals.watchHours)}
              change={compareTotals(data.totals, data.previousTotals, (t) => t.watchHours)}
              icon={<Clock className="h-4 w-4" />}
            />

            <StatCard
              label="Vidéos publiées"
              value={formatNumber(data.totals.videosPublished)}
              change={compareTotals(data.totals, data.previousTotals, (t) => t.videosPublished)}
              hint="sorties sur la période"
              icon={<Video className="h-4 w-4" />}
              details={<VideoList videos={data.videoPerformance} />}
            />
            <StatCard
              label={NATURE_LABELS.in_kind}
              value={formatNumber(data.totals.inKindEntries)}
              hint={`${formatMoney(data.totals.inKindCents)} valorisés`}
              icon={<Gift className="h-4 w-4" />}
              accent={data.totals.inKindEntries > 0 ? 'var(--in-kind)' : undefined}
              details={<InKindList entries={inKindEntries} />}
            />
            <StatCard
              label="Dépenses"
              value={formatMoney(data.totals.expenseCents)}
              change={compareTotals(data.totals, data.previousTotals, (t) => t.expenseCents)}
              hint="déduites en mode Bénéfices"
              icon={<Receipt className="h-4 w-4" />}
              accent={data.totals.expenseCents > 0 ? 'var(--expense)' : undefined}
            />
            <StatCard
              label="Engagement"
              value={formatNumber(data.totals.likes)}
              change={compareTotals(data.totals, data.previousTotals, (t) => t.likes)}
              hint={`${formatNumber(data.totals.comments)} commentaires`}
              icon={<Heart className="h-4 w-4" />}
            />

            {/* Ces deux-là ne suivent pas la période : ce sont des états du pipeline,
                pas des flux. Le sous-titre le dit plutôt que de laisser croire à un cumul. */}
            <StatCard
              label="Sponsos en cours"
              value={formatMoney(pipeline.sponsorshipsPendingCents)}
              hint={`${pipeline.sponsorshipsPending} en attente de paiement`}
              icon={<Handshake className="h-4 w-4" />}
              accent={pipeline.sponsorshipsPendingCents > 0 ? 'var(--color-positive)' : undefined}
            />
            <StatCard
              label="Produits attendus"
              value={formatNumber(pipeline.productsPending)}
              hint={
                pipeline.productsLate > 0 ? `${pipeline.productsLate} en retard` : 'aucun retard'
              }
              icon={<PackageOpen className="h-4 w-4" />}
              accent={pipeline.productsLate > 0 ? 'var(--color-negative)' : undefined}
            />
          </div>

          {/* Ce qui cloche vient avant les courbes : une déclaration en retard ou un
              produit qui n'arrive pas se traite aujourd'hui, la tendance attend. */}
          <div className="grid gap-4 xl:grid-cols-2">
            {production && <AlertsBanner alerts={production.alerts} />}
            {legal && <LegalAlertsCard alerts={legal.alerts} />}
          </div>

          {/* Même abscisse, survol synchronisé : côte à côte, une bosse de vues et un
              pic de revenus se lisent d'un seul regard. Ce sont les deux seuls
              graphiques de cet écran — le détail vit dans les onglets. */}
          <div className="grid gap-4 2xl:grid-cols-2">
            <MoneyChart data={data} />
            <AudienceChart data={data} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <ProductionQueueCard productions={production?.queue ?? []} totalSteps={steps.length} />
            <PipelineCard pipeline={pipeline} />
          </div>
        </>
      )}
    </div>
  );
};

/**
 * L'état des partenariats en quatre lignes, sans période.
 *
 * Une carte de liens plutôt que quatre `StatCard` de plus : ces chiffres sont déjà en
 * haut de l'écran, et ce qu'on cherche ici c'est l'accès à la table qui les détaille.
 */
const PipelineCard = ({ pipeline }: { pipeline: ReturnType<typeof partnerPipeline> }) => (
  <div className="grid grid-cols-2 gap-3">
    <StatCard
      label="Produits reçus"
      value={formatMoney(pipeline.productsReceivedCents)}
      hint={`${pipeline.productsReceived} produit(s), toutes périodes`}
      icon={<Gift className="h-4 w-4" />}
      accent={pipeline.productsReceivedCents > 0 ? 'var(--in-kind)' : undefined}
    />
    <StatCard
      label="Sponsos encaissées"
      value={formatMoney(pipeline.sponsorshipsPaidCents)}
      hint={`${pipeline.sponsorshipsPaid} sponso(s), toutes périodes`}
      icon={<Handshake className="h-4 w-4" />}
      accent={pipeline.sponsorshipsPaidCents > 0 ? 'var(--positive)' : undefined}
    />
  </div>
);
