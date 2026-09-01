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
import { useBrandStats } from '../../application/brand/usecases/useBrands.ts';
import { useProducts } from '../../application/product/usecases/useProducts.ts';
import { useSponsorships } from '../../application/sponsorship/usecases/useSponsorships.ts';
import { PENDING_PRODUCT_STATUSES } from '../../domain/product/entities/Product.ts';
import { PENDING_SPONSORSHIP_STATUSES } from '../../domain/sponsorship/entities/Sponsorship.ts';
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
import { DonutBreakdown, type DonutSlice } from '../components/charts/DonutBreakdown.tsx';
import { RankingBars, type RankingRow } from '../components/charts/RankingBars.tsx';
import { VideoPerformanceChart } from '../components/charts/VideoPerformanceChart.tsx';
import { VideoPerformanceTable } from '../components/charts/VideoPerformanceTable.tsx';
import { EmptyState } from '../components/EmptyState.tsx';

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

  // Classements des partenaires : mêmes bornes que le reste de l'écran, sans quoi ils
  // contrediraient les cartes du dessus.
  const { data: brandStats = [] } = useBrandStats({
    from: filters.from,
    to: filters.to,
    channelIds: filters.channelIds,
  });

  // Le pipeline, lui, n'est **pas** borné par la période : une sponso signée en mars et
  // pas encore payée reste à encaisser en juin. C'est un état, pas un flux.
  const { data: products = [] } = useProducts();
  const { data: sponsorships = [] } = useSponsorships();

  const pipeline = useMemo(() => {
    const today = toIsoDate(new Date());
    const pendingProducts = products.filter((product) =>
      PENDING_PRODUCT_STATUSES.includes(product.status),
    );
    const pendingSponsorships = sponsorships.filter((sponsorship) =>
      PENDING_SPONSORSHIP_STATUSES.includes(sponsorship.status),
    );
    return {
      productsPending: pendingProducts.length,
      productsLate: pendingProducts.filter(
        (product) => product.deadline !== null && product.deadline < today,
      ).length,
      sponsorshipsPending: pendingSponsorships.length,
      sponsorshipsPendingCents: pendingSponsorships.reduce(
        (total, sponsorship) => total + sponsorship.amountCents,
        0,
      ),
    };
  }, [products, sponsorships]);

  const brandRows = useMemo<RankingRow[]>(
    () =>
      brandStats.map((brand) => ({
        id: brand.brandId,
        label: brand.brandName,
        color: brand.color,
        value: brand.productsValueCents,
        formatted: formatMoney(brand.productsValueCents),
        hint: `${brand.productsCount} produit(s)`,
      })),
    [brandStats],
  );

  const sponsorRows = useMemo<RankingRow[]>(
    () =>
      brandStats.map((brand) => ({
        id: brand.brandId,
        label: brand.brandName,
        color: brand.color,
        value: brand.sponsorshipsPaidCents,
        formatted: formatMoney(brand.sponsorshipsPaidCents),
        hint: `${brand.sponsorshipsPaidCount} sponso(s)`,
      })),
    [brandStats],
  );

  const moneyOptions = { mode: filters.moneyMode, includeInKind: filters.includeInKind };

  // L'anneau par chaîne se lit à côté de ceux des catégories : même unité, donc l'argent
  // gagné par chaîne, et non les vues — sinon on comparerait trois échelles différentes.
  const channelSlices = useMemo<DonutSlice[]>(
    () =>
      (data?.byChannel ?? []).map((channel) => ({
        id: channel.channelId,
        label: channel.channelName,
        color: channel.color,
        cents: channel.revenueCashCents + (filters.includeInKind ? channel.inKindCents : 0),
      })),
    [data?.byChannel, filters.includeInKind],
  );

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
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
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
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
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

          {/* Même abscisse, survol synchronisé : côte à côte, une bosse de vues et un
              pic de revenus se lisent d'un seul regard. */}
          <div className="grid gap-4 2xl:grid-cols-2">
            <MoneyChart data={data} />
            <AudienceChart data={data} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {/* Décoché, l'anneau ne montre pas les produits reçus : son total doit
                rester celui du CA affiché partout ailleurs. */}
            <DonutBreakdown
              title="Répartition des revenus"
              slices={data.byCategory
                .filter((item) => filters.includeInKind || item.nature !== 'in_kind')
                .map((item) => ({
                  id: `r-${item.categoryId}`,
                  label: item.categoryName,
                  color: item.color,
                  cents: item.totalCents,
                  badge: item.nature === 'in_kind' ? NATURE_LABELS.in_kind : undefined,
                }))}
              emptyLabel="Aucun revenu sur cette période."
              totalHint={filters.includeInKind ? 'produits reçus compris' : undefined}
            />
            <DonutBreakdown
              title="Répartition des dépenses"
              slices={data.byExpenseCategory.map((item) => ({
                id: `e-${item.categoryId}`,
                label: item.categoryName,
                color: item.color,
                cents: item.totalCents,
              }))}
              emptyLabel="Aucune dépense sur cette période."
            />
            {/* Les revenus globaux (sans chaîne) ne sont dans aucune tranche : le total
                de cet anneau peut être inférieur à celui des revenus, c'est voulu. */}
            <DonutBreakdown
              title="Revenus par chaîne"
              slices={channelSlices}
              emptyLabel="Aucun revenu rattaché à une chaîne sur cette période."
              totalHint="hors revenus globaux"
            />
          </div>

          {/* Barres horizontales et non anneaux : sur un top-N ordonné, c'est le rang et
              l'écart au premier qu'on lit, deux choses qu'une longueur donne d'un coup. */}
          <div className="grid gap-4 lg:grid-cols-2">
            <RankingBars
              title="Marques les plus généreuses"
              description="Valeur des produits reçus sur la période."
              rows={brandRows}
              emptyLabel="Aucun produit reçu sur cette période."
            />
            <RankingBars
              title="Sponsors qui paient le plus"
              description="Sponsos encaissées sur la période."
              rows={sponsorRows}
              emptyLabel="Aucune sponso encaissée sur cette période."
            />
          </div>

          <div className="grid gap-4 2xl:grid-cols-2">
            <VideoPerformanceChart data={data} />
            <VideoPerformanceTable data={data} />
          </div>
        </>
      )}
    </div>
  );
};
