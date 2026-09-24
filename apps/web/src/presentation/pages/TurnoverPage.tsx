import { useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { Block } from '../dashboard/Block.tsx';

const TABS = ['synthese', 'revenus', 'depenses'] as const;
type TurnoverTab = (typeof TABS)[number];

/**
 * Le chiffre d'affaires en un seul écran : la synthèse, puis les deux grands livres.
 *
 * Revenus et dépenses décrivent les deux moitiés de la même soustraction et se consultent
 * l'un après l'autre. Les anciennes adresses `/revenus` et `/depenses` redirigent ici, sur
 * le bon onglet. Chaque morceau est un bloc du catalogue, ajoutable au dashboard.
 */
export const TurnoverPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('onglet');
  const tab: TurnoverTab = TABS.includes(requested as TurnoverTab)
    ? (requested as TurnoverTab)
    : 'synthese';

  return (
    <div className="space-y-4">
      <div className="hidden lg:block">
        <h1 className="text-lg font-semibold">Chiffre d'affaires</h1>
        <p className="text-sm text-muted-foreground">
          Ce qui rentre, ce qui sort, et la soustraction des deux — sur la période choisie en haut.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Block id="money.gross" />
        <Block id="money.profit" />
        <Block id="money.expenses" />
        <Block id="money.inKindValue" />
        {/* Ce qui est engagé mais pas encore passé, hors des quatre chiffres précédents. */}
        <Block id="money.upcoming" />
      </div>

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ onglet: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="synthese">Synthèse</TabsTrigger>
          <TabsTrigger value="revenus">Revenus</TabsTrigger>
          <TabsTrigger value="depenses">Dépenses</TabsTrigger>
        </TabsList>

        <TabsContent value="synthese" className="space-y-4">
          {/* Le même graphique que le dashboard, entouré ici de tout son détail. */}
          <Block id="money.chart" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Block id="money.revenueSplit" />
            <Block id="money.expenseSplit" />
            <Block id="money.channelSplit" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Block id="money.brandRanking" />
            <Block id="money.sponsorRanking" />
          </div>
        </TabsContent>

        <TabsContent value="revenus">
          <Block id="money.revenues" />
        </TabsContent>

        <TabsContent value="depenses" className="space-y-8">
          <Block id="money.expensesTable" />
          {/* Les dépenses récurrentes engendrent les lignes du tableau ci-dessus. */}
          <Block id="money.recurring" />
        </TabsContent>
      </Tabs>
    </div>
  );
};
