import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  Layers,
  Link2,
  MousePointerClick,
  PiggyBank,
  RefreshCw,
  ShoppingCart,
  Trophy,
  Unlink,
  Wallet,
} from 'lucide-react';
import { usePlatforms } from '../../application/affiliate/usecases/usePlatforms.ts';
import { useRevenues } from '../../application/revenue/usecases/useRevenues.ts';
import {
  useCollectIntegration,
  useDomadooOverview,
  useIntegrations,
} from '../../application/integration/usecases/useIntegrations.ts';
import { AFFILIATE_CATEGORY_ID } from '../../domain/category/entities/Category.ts';
import { formatDate, formatNumber } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { PeriodPicker } from '../components/filters/PeriodPicker.tsx';
import { PlatformsPanel } from '../components/partners/PlatformsPanel.tsx';
import { DomadooChart } from '../components/domadoo/DomadooChart.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';

const TABS = ['domadoo', 'plateformes'] as const;
type AffiliationsTab = (typeof TABS)[number];

/**
 * L'affiliation en un seul écran : Domadoo (auto-alimenté dès que ses identifiants sont
 * renseignés dans Paramètres → Revenus → Affiliation, et la source activée dans
 * Paramètres → API) puis les autres plateformes, qui se rattachent à la main sur chaque
 * revenu.
 *
 * Ancien `/plateformes` — l'adresse redirige ici, sur l'onglet Plateformes. Domadoo est
 * le premier onglet, pas parce qu'il rapporte plus, mais parce qu'il est le seul à ne
 * demander aucune saisie : la collecte horaire y écrit toute seule, et c'est ce qui en
 * fait le point d'entrée naturel de l'écran.
 */
export const AffiliationsPage = () => {
  const filters = useFilters();

  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('onglet');
  const tab: AffiliationsTab = TABS.includes(requested as AffiliationsTab)
    ? (requested as AffiliationsTab)
    : 'domadoo';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">Affiliations</h1>
          <p className="text-sm text-muted-foreground">
            Domadoo, collecté automatiquement, et les autres plateformes rattachées à la main sur
            chaque revenu.
          </p>
        </div>
        <PeriodPicker />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ onglet: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="domadoo">Domadoo</TabsTrigger>
          <TabsTrigger value="plateformes">Plateformes</TabsTrigger>
        </TabsList>

        <TabsContent value="domadoo" className="space-y-4">
          <DomadooTab from={filters.from} to={filters.to} />
        </TabsContent>

        <TabsContent value="plateformes" className="space-y-4">
          <PlatformsTab from={filters.from} to={filters.to} channelIds={filters.channelIds} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const DomadooTab = ({ from, to }: { from: string; to: string }) => {
  const privacy = usePrivacy();
  const { data: integrations } = useIntegrations();
  const domadoo = integrations?.providers.find((provider) => provider.id === 'domadoo');
  const { data: overview, isLoading } = useDomadooOverview({ from, to, granularity: 'day' });
  const collect = useCollectIntegration();

  if (integrations && !domadoo?.configured) {
    return (
      <Card className="space-y-3 p-6 text-center">
        <Wallet className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Domadoo n'est pas configuré</p>
        <p className="mx-auto max-w-lg text-sm text-muted-foreground">
          Renseigne tes identifiants Domadoo : clics, ventes et solde sont relevés chaque heure, et
          l'onglet se remplit tout seul.
        </p>
        <Button asChild size="sm">
          <Link to="/parametres?onglet=affiliation">Configurer Domadoo</Link>
        </Button>
      </Card>
    );
  }

  const totals = overview?.totals;
  const previous = overview?.previousTotals;
  const change = (
    value: number | null | undefined,
    previousValue: number | null | undefined,
  ): number | null => {
    if (value == null || previousValue == null || previousValue === 0) return null;
    return ((value - previousValue) / previousValue) * 100;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {overview?.firstSnapshotDate
            ? `Historique depuis le ${formatDate(overview.firstSnapshotDate)}`
            : "Aucun relevé pour l'instant : le premier passage de la collecte horaire l'écrira."}
          {overview?.lastUpdate && ` · dernier relevé le ${formatDate(overview.lastUpdate)}`}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={collect.isPending}
          onClick={() => collect.mutate('domadoo')}
        >
          <RefreshCw className={cn('h-4 w-4', collect.isPending && 'animate-spin')} />
          {collect.isPending ? 'Collecte…' : 'Collecter'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Gains"
          value={totals ? privacy.money(totals.earningsGainedCents ?? 0, 'affiliation') : '—'}
          change={privacy.change(
            change(totals?.earningsGainedCents, previous?.earningsGainedCents),
            'affiliation',
          )}
          hint="commissions validées sur la période"
          icon={<Wallet className="h-4 w-4" />}
          accent={totals && (totals.earningsGainedCents ?? 0) > 0 ? 'var(--cash)' : undefined}
        />
        <StatCard
          label="Clics"
          value={formatNumber(totals?.clicksGained ?? 0)}
          hint="sur la période"
          icon={<MousePointerClick className="h-4 w-4" />}
        />
        <StatCard
          label="Ventes validées"
          value={formatNumber(totals?.approvedSalesGained ?? 0)}
          hint="sur la période"
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
        <StatCard
          label="Solde"
          value={totals ? privacy.money(totals.balanceCents ?? 0, 'affiliation') : '—'}
          hint="au dernier relevé, pas un cumul de la période"
          icon={<PiggyBank className="h-4 w-4" />}
        />
        <StatCard
          label="En attente de paiement"
          value={totals ? privacy.money(totals.waitingPaymentsCents ?? 0, 'affiliation') : '—'}
          hint="dû par Domadoo, pas encore versé"
          icon={<Clock className="h-4 w-4" />}
        />
        <StatCard
          label="Ventes en attente"
          value={totals ? privacy.money(totals.waitingSalesCents ?? 0, 'affiliation') : '—'}
          hint="commandes pas encore validées"
          icon={<ShoppingCart className="h-4 w-4" />}
        />
      </div>

      <Card className="p-4">
        {isLoading && !overview ? (
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        ) : (
          <DomadooChart series={overview?.series ?? []} granularity="day" />
        )}
      </Card>
    </div>
  );
};

const PlatformsTab = ({
  from,
  to,
  channelIds,
}: {
  from: string;
  to: string;
  channelIds: string[];
}) => {
  const privacy = usePrivacy();

  // Mêmes paramètres que `PlatformsPanel` : la requête est partagée, pas dupliquée.
  const { data: platforms = [] } = usePlatforms({ includeArchived: true, from, to });
  const { data: revenues = [] } = useRevenues({ from, to, channelIds });

  const stats = useMemo(() => {
    const rows = revenues.filter((entry) => entry.categoryId === AFFILIATE_CATEGORY_ID);
    const active = platforms.filter((platform) => !platform.isArchived);
    const best = [...active].sort((a, b) => b.earnedCents - a.earnedCents)[0];
    return {
      totalCents: rows.reduce((sum, entry) => sum + entry.amountCents, 0),
      count: rows.length,
      unlinked: rows.filter((entry) => entry.platformId === null).length,
      active: active.length,
      archived: platforms.length - active.length,
      best: best && best.earnedCents > 0 ? best : null,
    };
  }, [revenues, platforms]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Total affiliations"
          value={privacy.money(stats.totalCents, 'affiliation')}
          hint={`${stats.count} revenu(s) sur la période · hors AdSense`}
          icon={<Link2 className="h-4 w-4" />}
          accent={stats.totalCents > 0 ? 'var(--positive)' : undefined}
        />
        <StatCard
          label="Sans plateforme"
          value={formatNumber(stats.unlinked)}
          hint="revenus d'affiliation à rattacher"
          icon={<Unlink className="h-4 w-4" />}
          accent={stats.unlinked > 0 ? 'var(--expense)' : undefined}
        />
        <StatCard
          label="En tête"
          value={stats.best?.name ?? '—'}
          hint={
            stats.best
              ? `${privacy.money(stats.best.earnedCents, 'affiliation')} sur la période`
              : 'aucun gain rattaché sur la période'
          }
          icon={<Trophy className="h-4 w-4" />}
        />
        <StatCard
          label="Plateformes suivies"
          value={formatNumber(stats.active)}
          hint={stats.archived > 0 ? `${stats.archived} archivée(s)` : 'aucune archivée'}
          icon={<Layers className="h-4 w-4" />}
        />
      </div>

      <PlatformsPanel />
    </div>
  );
};
