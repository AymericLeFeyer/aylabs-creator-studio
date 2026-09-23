import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layers, Link2, RefreshCw, Trophy, Unlink, Wallet } from 'lucide-react';
import { usePlatforms } from '../../application/affiliate/usecases/usePlatforms.ts';
import { useRevenues } from '../../application/revenue/usecases/useRevenues.ts';
import {
  useCollectIntegration,
  useDomadooOverview,
  useIntegrations,
} from '../../application/integration/usecases/useIntegrations.ts';
import { AFFILIATE_CATEGORY_ID } from '../../domain/category/entities/Category.ts';
import type { DomadooExport } from '../../domain/integration/entities/DomadooOverview.ts';
import { formatDate, formatDateTime, formatNumber } from '../../shared/format.ts';
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
import { Badge } from '../components/ui/badge.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx';

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

  // L'instantané brut, tel que Domadoo le renvoie — pas l'historique reconstruit
  // ci-dessous, ses deux fenêtres fixes et les dernières ventes.
  const snapshot = (domadoo?.data ?? null) as DomadooExport | null;

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-xs text-muted-foreground">
        {overview?.firstSnapshotDate
          ? `Historique depuis le ${formatDate(overview.firstSnapshotDate)}`
          : "Aucun relevé pour l'instant : le premier passage de la collecte horaire l'écrira."}
        {domadoo?.lastUpdate && ` · dernier relevé le ${formatDateTime(domadoo.lastUpdate)}`}
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
  );

  // Configuré, mais la collecte horaire n'est pas encore passée : rien à afficher que
  // l'invite à patienter, ou à déclencher le premier relevé soi-même.
  if (!snapshot) {
    return (
      <div className="space-y-4">
        {header}
        <Card className="space-y-3 p-6 text-center">
          <Wallet className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">Aucune collecte pour l'instant</p>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            Domadoo est configuré, mais rien n'a encore été relevé. La collecte tourne toutes les
            heures — ou lance-la maintenant avec le bouton ci-dessus.
          </p>
        </Card>
      </div>
    );
  }

  // Domadoo parle en euros : ce n'est pas un montant du domaine, mais un contrat externe
  // recopié tel quel. `null` reste `null` — « pas mesuré » n'est pas « zéro ».
  const money = (value: number | null): string =>
    value === null ? '—' : privacy.money(Math.round(value * 100), 'affiliation');
  const count = (value: number | null): string => (value === null ? '—' : formatNumber(value));

  return (
    <div className="space-y-4">
      {header}

      {/* Les deux fenêtres que Domadoo calcule lui-même, telles quelles — distinctes de
          l'historique du bas, qui suit la période choisie en haut de l'écran. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <InfoCard
          title="30 derniers jours"
          rows={[
            { label: 'Clics', value: count(snapshot.last30days.clicks) },
            { label: 'Clics uniques', value: count(snapshot.last30days.uniquesClicks) },
            { label: 'Ventes validées', value: count(snapshot.last30days.approvedSales) },
            { label: 'Ventes en attente', value: count(snapshot.last30days.waitingSales) },
            { label: 'Gains', value: money(snapshot.last30days.earnings) },
            {
              label: 'Commissions en attente',
              value: money(snapshot.last30days.waitingSalesTotal),
            },
          ]}
        />
        <InfoCard
          title="Total depuis toujours"
          rows={[
            { label: 'Clics', value: count(snapshot.total.clicks) },
            { label: 'Clics uniques', value: count(snapshot.total.uniquesClicks) },
            { label: 'Ventes validées', value: count(snapshot.total.approvedSales) },
            { label: 'Gains', value: money(snapshot.total.earnings) },
            { label: 'Versé', value: money(snapshot.total.payments) },
            { label: 'En attente de versement', value: money(snapshot.total.waitingPayments) },
            { label: 'Solde', value: money(snapshot.total.balance) },
          ]}
        />
      </div>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold">Ventes récentes</h3>
        {snapshot.lastSales.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aucune vente relevée pour l'instant.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Commande</TableHead>
                <TableHead className="text-right">Commission</TableHead>
                <TableHead>Statut</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {snapshot.lastSales.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium">{sale.id}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(sale.date)}
                  </TableCell>
                  <TableCell className="text-right tabular">{money(sale.order)}</TableCell>
                  <TableCell className="text-right tabular">{money(sale.commission)}</TableCell>
                  <TableCell>
                    {sale.approved ? (
                      <Badge variant="cash">Validée</Badge>
                    ) : (
                      <Badge variant="outline">En attente</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="space-y-2 p-4">
        <div>
          <h3 className="text-sm font-semibold">Évolution</h3>
          <p className="text-xs text-muted-foreground">
            Sur la période choisie en haut de l'écran — distincte des deux fenêtres fixes ci-dessus.
          </p>
        </div>
        {isLoading && !overview ? (
          <div className="h-64 animate-pulse rounded-xl bg-muted" />
        ) : (
          <DomadooChart series={overview?.series ?? []} granularity="day" />
        )}
      </Card>
    </div>
  );
};

const InfoCard = ({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; value: string }>;
}) => (
  <Card className="p-4">
    <h3 className="mb-1 text-sm font-semibold">{title}</h3>
    <dl className="divide-y divide-border/60">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between py-1.5 text-sm">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="font-medium tabular">{row.value}</dd>
        </div>
      ))}
    </dl>
  </Card>
);

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
