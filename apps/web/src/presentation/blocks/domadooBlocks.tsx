import { Link } from 'react-router-dom';
import { Coins, MousePointerClick, ShoppingCart, Wallet } from 'lucide-react';
import {
  useDomadooOverview,
  useIntegrations,
} from '../../application/integration/usecases/useIntegrations.ts';
import type { DomadooExport } from '../../domain/integration/entities/DomadooOverview.ts';
import { formatDateTime, formatNumber } from '../../shared/format.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { DomadooChart } from '../components/domadoo/DomadooChart.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card } from '../components/ui/card.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx';
import { AddToDashboardButton } from '../dashboard/AddToDashboard.tsx';
import { BlockHeading } from '../dashboard/BlockHeading.tsx';
import {
  DOMADOO_ROWS,
  DOMADOO_WINDOWS,
  type DomadooRow,
  type DomadooWindow,
} from './domadooRows.ts';
import { BlockSkeleton } from './BlockSkeleton.tsx';

const ICONS = { click: MousePointerClick, sale: ShoppingCart, money: Coins, balance: Wallet };

/** L'instantané brut de Domadoo, tel que la dernière collecte l'a figé. */
const useDomadooSnapshot = () => {
  const { data } = useIntegrations();
  const domadoo = data?.providers.find((provider) => provider.id === 'domadoo');
  return {
    configured: domadoo?.configured ?? false,
    loaded: data !== undefined,
    lastUpdate: domadoo?.lastUpdate ?? null,
    snapshot: (domadoo?.data ?? null) as DomadooExport | null,
  };
};

/**
 * Domadoo parle en euros : ce n'est pas un montant du domaine, mais un contrat externe
 * recopié tel quel. `null` reste `null` — « pas mesuré » n'est pas « zéro ».
 */
const useFormatRow = () => {
  const privacy = usePrivacy();
  return (row: DomadooRow, snapshot: DomadooExport | null): string => {
    const window = snapshot?.[row.window] as Record<string, number | null> | undefined;
    const value = window?.[row.field] ?? null;
    if (value === null) return '—';
    return row.kind === 'money'
      ? privacy.money(Math.round(value * 100), 'affiliation')
      : formatNumber(value);
  };
};

/**
 * Une ligne des fenêtres Domadoo **en grand chiffre** : c'est ce qu'on pose sur le
 * dashboard depuis le bouton de la ligne, plutôt que le tableau entier.
 */
export const DomadooMetricCard = ({ rowId }: { rowId: string }) => {
  const format = useFormatRow();
  const { snapshot, lastUpdate } = useDomadooSnapshot();
  const row = DOMADOO_ROWS.find((candidate) => candidate.id === rowId);
  if (!row) return null;
  const Icon = ICONS[row.icon];
  return (
    <StatCard
      label={`Domadoo · ${row.label}`}
      value={format(row, snapshot)}
      hint={`${DOMADOO_WINDOWS[row.window]}${lastUpdate ? ` · relevé le ${formatDateTime(lastUpdate)}` : ''}`}
      icon={<Icon className="h-4 w-4" />}
    />
  );
};

/**
 * Une des deux fenêtres que Domadoo calcule lui-même (30 derniers jours, total), telle
 * quelle. Chaque ligne porte son propre bouton d'ajout au dashboard, visible au survol.
 */
export const DomadooWindowCard = ({ window }: { window: DomadooWindow }) => {
  const format = useFormatRow();
  const { snapshot } = useDomadooSnapshot();
  const rows = DOMADOO_ROWS.filter((row) => row.window === window);
  return (
    <Card className="p-4">
      <BlockHeading title={DOMADOO_WINDOWS[window]} className="mb-1" />
      <dl className="divide-y divide-border/60">
        {rows.map((row) => (
          <div
            key={row.id}
            className="group/row flex items-center justify-between gap-2 py-1.5 text-sm"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="flex items-center gap-2 font-medium tabular">
              {format(row, snapshot)}
              <AddToDashboardButton
                blockId={`domadoo.${row.id}`}
                width={1}
                label={`Domadoo · ${row.label}`}
                className="h-5 w-5 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100"
              />
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
};

export const DomadooChartBlock = () => {
  const filters = useFilters();
  const { data: overview, isLoading } = useDomadooOverview({
    from: filters.from,
    to: filters.to,
    granularity: 'day',
  });
  return (
    <Card className="space-y-2 p-4">
      <BlockHeading
        title="Évolution Domadoo"
        description="Sur la période choisie — distincte des deux fenêtres fixes que Domadoo calcule."
      />
      {isLoading && !overview ? (
        <BlockSkeleton className="h-64 border-0" />
      ) : (
        <DomadooChart series={overview?.series ?? []} granularity="day" />
      )}
    </Card>
  );
};

export const DomadooSalesBlock = () => {
  const privacy = usePrivacy();
  const { snapshot, configured, loaded } = useDomadooSnapshot();
  const money = (value: number | null): string =>
    value === null ? '—' : privacy.money(Math.round(value * 100), 'affiliation');

  if (loaded && !configured) {
    return (
      <Card className="space-y-3 p-6 text-center text-sm">
        <p className="text-muted-foreground">Domadoo n'est pas configuré.</p>
        <Button asChild size="sm">
          <Link to="/parametres?onglet=affiliation">Configurer Domadoo</Link>
        </Button>
      </Card>
    );
  }

  const sales = snapshot?.lastSales ?? [];
  return (
    <Card className="p-4">
      <BlockHeading title="Ventes récentes Domadoo" className="mb-3" />
      {sales.length === 0 ? (
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
            {sales.map((sale) => (
              <TableRow key={sale.id}>
                <TableCell className="font-medium">{sale.id}</TableCell>
                <TableCell className="text-muted-foreground">{formatDateTime(sale.date)}</TableCell>
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
  );
};
