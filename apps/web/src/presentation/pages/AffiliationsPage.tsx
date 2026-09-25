import { Link, useSearchParams } from 'react-router-dom';
import { RefreshCw, ShoppingCart, Wallet } from 'lucide-react';
import {
  useAmazonOverview,
  useCollectIntegration,
  useDomadooOverview,
  useIntegrations,
} from '../../application/integration/usecases/useIntegrations.ts';
import type { DomadooExport } from '../../domain/integration/entities/DomadooOverview.ts';
import { integrationStatus } from '../../domain/integration/entities/Integration.ts';
import { formatDate, formatDateTime } from '../../shared/format.ts';
import { cn } from '../../shared/cn.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { PeriodPicker } from '../components/filters/PeriodPicker.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import { Block } from '../dashboard/Block.tsx';
import { DomadooWindowCard } from '../blocks/domadooBlocks.tsx';

const TABS = ['domadoo', 'amazon', 'plateformes'] as const;
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
            Domadoo et Amazon, collectés automatiquement, et les autres plateformes rattachées à la
            main sur chaque revenu.
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
          <TabsTrigger value="amazon">Amazon</TabsTrigger>
          <TabsTrigger value="plateformes">Plateformes</TabsTrigger>
        </TabsList>

        <TabsContent value="domadoo" className="space-y-4">
          <DomadooTab from={filters.from} to={filters.to} />
        </TabsContent>

        <TabsContent value="amazon" className="space-y-4">
          <AmazonTab from={filters.from} to={filters.to} />
        </TabsContent>

        <TabsContent value="plateformes" className="space-y-4">
          <PlatformsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

const DomadooTab = ({ from, to }: { from: string; to: string }) => {
  const { data: integrations } = useIntegrations();
  const domadoo = integrations?.providers.find((provider) => provider.id === 'domadoo');
  const { data: overview } = useDomadooOverview({ from, to, granularity: 'day' });
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

  return (
    <div className="space-y-4">
      {header}

      <Block id="domadoo.chart" />

      {/* Les deux fenêtres que Domadoo calcule lui-même, telles quelles. Chaque ligne porte
          son bouton d'ajout : elle se pose en grand chiffre sur le dashboard, plutôt que
          le tableau entier. */}
      <div className="grid gap-3 lg:grid-cols-2">
        <DomadooWindowCard window="last30days" />
        <DomadooWindowCard window="total" />
      </div>

      <Block id="domadoo.sales" />
    </div>
  );
};

/**
 * Amazon Partenaires, lu dans son tableau de bord à chaque passage horaire. Amazon ne
 * donne que le **mois en cours** : les cartes du haut le reprennent tel quel (exact, hors
 * période), les suivantes et le graphique reconstruisent la période par différence de
 * relevés quotidiens.
 */
const AmazonTab = ({ from, to }: { from: string; to: string }) => {
  const { data: integrations } = useIntegrations();
  const amazon = integrations?.providers.find((provider) => provider.id === 'amazon');
  const { data: overview } = useAmazonOverview({ from, to, granularity: 'day' });
  const collect = useCollectIntegration();

  if (integrations && !amazon?.configured) {
    return (
      <Card className="space-y-3 p-6 text-center">
        <ShoppingCart className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">Amazon n'est pas configuré</p>
        <p className="mx-auto max-w-lg text-sm text-muted-foreground">
          Renseigne tes identifiants Amazon Partenaires : clics, commandes et gains du mois sont
          relevés chaque heure, et l'onglet se remplit tout seul.
        </p>
        <Button asChild size="sm">
          <Link to="/parametres?onglet=affiliation">Configurer Amazon</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {overview?.firstSnapshotDate
            ? `Historique depuis le ${formatDate(overview.firstSnapshotDate)}`
            : "Aucun relevé pour l'instant : le premier passage de la collecte horaire l'écrira."}
          {amazon?.lastUpdate && ` · dernier relevé le ${formatDateTime(amazon.lastUpdate)}`}
          {amazon && integrationStatus(amazon) === 'error' && (
            <span className="text-[var(--negative)]"> · dernier échec : {amazon.lastError}</span>
          )}
        </p>
        <Button
          size="sm"
          variant="outline"
          disabled={collect.isPending}
          onClick={() => collect.mutate('amazon')}
          title="Environ 20 secondes : un navigateur se connecte au compte"
        >
          <RefreshCw className={cn('h-4 w-4', collect.isPending && 'animate-spin')} />
          {collect.isPending ? 'Collecte…' : 'Collecter'}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <Block id="amazon.month.earnings" />
        <Block id="amazon.month.clicks" />
        <Block id="amazon.month.ordered" />
        <Block id="amazon.month.conversion" />
        <Block id="amazon.month.shippedRevenue" />
        <Block id="amazon.waiting" />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Block id="amazon.period.earnings" />
        <Block id="amazon.period.clicks" />
        <Block id="amazon.period.conversion" />
      </div>

      <Block id="amazon.chart" />

      <div className="grid gap-3 lg:grid-cols-2">
        <Block id="amazon.funnel" />
        <Block id="amazon.months" />
      </div>
    </div>
  );
};

const PlatformsTab = () => (
  <div className="space-y-4">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Block id="affiliation.total" />
      <Block id="affiliation.unlinked" />
      <Block id="affiliation.best" />
      <Block id="affiliation.platforms" />
    </div>

    <Block id="affiliation.panel" />
  </div>
);
