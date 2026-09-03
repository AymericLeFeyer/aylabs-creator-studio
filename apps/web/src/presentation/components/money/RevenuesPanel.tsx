import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Lock, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  useDeleteRevenue,
  useRevenues,
} from '../../../application/revenue/usecases/useRevenues.ts';
import { useUpcomingRevenues } from '../../../application/expense/usecases/useUpcoming.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import type { RevenueEntry } from '../../../domain/revenue/entities/Revenue.ts';
import { ORIGIN_LABELS, ORIGIN_TARGET } from '../../../domain/revenue/entities/Revenue.ts';
import { NATURE_LABELS } from '../../../domain/category/entities/Category.ts';
import { formatDate, formatMoney } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Badge } from '../ui/badge.tsx';
import { Card, CardHeader, CardTitle } from '../ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { RevenueDialog } from '../forms/RevenueDialog.tsx';
import { ProductDialog } from '../forms/ProductDialog.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { UpcomingSection } from './UpcomingSection.tsx';

interface RevenueTableProps {
  entries: RevenueEntry[];
  onEdit: (entry: RevenueEntry) => void;
  onDelete: (entry: RevenueEntry) => void;
  onDocument: (entry: RevenueEntry) => void;
}

/**
 * Le tableau des revenus, partagé par la période et par le bloc « à venir ».
 * Une seule définition : deux tableaux qui divergeraient d'une colonne rendraient la
 * comparaison entre ce qui est encaissé et ce qui arrive plus difficile qu'elle ne doit
 * l'être.
 */
const RevenueTable = ({ entries, onEdit, onDelete, onDocument }: RevenueTableProps) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Date</TableHead>
        <TableHead>Libellé</TableHead>
        <TableHead>Catégorie</TableHead>
        <TableHead>Chaîne</TableHead>
        <TableHead>Vidéo</TableHead>
        <TableHead className="text-right">Montant</TableHead>
        <TableHead className="w-20" />
      </TableRow>
    </TableHeader>
    <TableBody>
      {entries.map((entry) => (
        <TableRow key={entry.id}>
          <TableCell className="whitespace-nowrap text-muted-foreground tabular">
            {formatDate(entry.date)}
          </TableCell>
          <TableCell className="font-medium">
            {entry.label}
            {/* Une entrée générée dit d'où elle vient et où la corriger : sans ça,
                le bouton grisé serait vécu comme une panne. */}
            {entry.origin !== 'manual' && (
              <Link
                to={ORIGIN_TARGET[entry.origin]}
                className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-normal text-muted-foreground hover:text-foreground hover:underline"
                title="Cette entrée est générée : elle se modifie depuis sa fiche."
              >
                <Lock className="h-3 w-3" aria-hidden />
                {ORIGIN_LABELS[entry.origin]}
              </Link>
            )}
            {entry.notes && (
              <span className="block text-xs font-normal text-muted-foreground">{entry.notes}</span>
            )}
          </TableCell>
          <TableCell>
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.categoryColor }}
                aria-hidden
              />
              {entry.categoryName}
              {entry.categoryNature === 'in_kind' && (
                <Badge variant="inKind">{NATURE_LABELS.in_kind}</Badge>
              )}
            </span>
          </TableCell>
          <TableCell className="text-muted-foreground">{entry.channelName ?? 'Global'}</TableCell>
          <TableCell className="max-w-[14rem] text-muted-foreground">
            <span className="line-clamp-1" title={entry.videoTitle ?? undefined}>
              {entry.videoTitle ?? '—'}
            </span>
          </TableCell>
          <TableCell className="text-right tabular font-medium">
            {formatMoney(entry.amountCents)}
          </TableCell>
          <TableCell>
            <div className="flex justify-end gap-1">
              {/* Un produit reçu saisi à la main n'a pas de fiche : marque,
                  échéance, sponso associée, tout est perdu. Le + ouvre le
                  formulaire produit pré-rempli pour le documenter enfin. */}
              {entry.origin === 'manual' && entry.categoryNature === 'in_kind' && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Créer la fiche produit correspondante"
                  onClick={() => onDocument(entry)}
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  <span className="sr-only">Documenter « {entry.label} »</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                disabled={entry.origin !== 'manual'}
                title={
                  entry.origin === 'manual'
                    ? 'Modifier'
                    : 'Généré automatiquement : modifie-le depuis sa fiche.'
                }
                onClick={() => onEdit(entry)}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only">Modifier</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={entry.origin !== 'manual'}
                onClick={() => onDelete(entry)}
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                <span className="sr-only">Supprimer</span>
              </Button>
            </div>
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

export const RevenuesPanel = () => {
  const filters = useFilters();
  const { data: entries = [], isLoading } = useRevenues({
    from: filters.from,
    to: filters.to,
    channelIds: filters.channelIds,
  });
  const upcoming = useUpcomingRevenues(filters.channelIds);
  const remove = useDeleteRevenue();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RevenueEntry | null>(null);
  /** Revenu en nature en cours de documentation : il devient une fiche produit. */
  const [documenting, setDocumenting] = useState<RevenueEntry | null>(null);

  const totals = useMemo(() => {
    const cash = entries
      .filter((entry) => entry.categoryNature === 'cash')
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    const inKind = entries
      .filter((entry) => entry.categoryNature === 'in_kind')
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    return { cash, inKind };
  }, [entries]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (entry: RevenueEntry) => {
    setEditing(entry);
    setDialogOpen(true);
  };

  const confirmDelete = (entry: RevenueEntry) => {
    if (window.confirm(`Supprimer « ${entry.label} » ?`)) remove.mutate(entry.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            <span className="text-muted-foreground">Encaissé : </span>
            <span className="tabular font-semibold">{formatMoney(totals.cash)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">{NATURE_LABELS.in_kind} : </span>
            <span className="tabular font-semibold text-[var(--in-kind)]">
              {formatMoney(totals.inKind)}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            AdSense non listé ici : collecté automatiquement
          </span>
        </div>

        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Ajouter un revenu
        </Button>
      </div>

      {!isLoading && entries.length === 0 ? (
        <EmptyState
          title="Aucun revenu sur cette période"
          description="Ajoute tes sponsos, revenus d'affiliation ou produits reçus pour les voir apparaître dans le dashboard."
          actionLabel="Ajouter un revenu"
          onAction={openCreate}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{entries.length} revenu(s)</CardTitle>
          </CardHeader>
          <RevenueTable
            entries={entries}
            onEdit={openEdit}
            onDelete={confirmDelete}
            onDocument={setDocumenting}
          />
        </Card>
      )}

      {/* Ce qui est déjà daté en avant : une sponso encaissable le mois prochain, une
          facture d'affiliation programmée. Hors des totaux ci-dessus, et le bloc le dit. */}
      <UpcomingSection
        kind="revenue"
        count={upcoming.revenues.length}
        totalCents={upcoming.totalCents}
        from={formatDate(upcoming.range.from)}
        to={formatDate(upcoming.range.to)}
      >
        <RevenueTable
          entries={upcoming.revenues}
          onEdit={openEdit}
          onDelete={confirmDelete}
          onDocument={setDocumenting}
        />
      </UpcomingSection>

      <RevenueDialog open={dialogOpen} onOpenChange={setDialogOpen} entry={editing} />

      {/* La fiche produit régénère un revenu équivalent (`origin: 'product'`) : l'entrée
          manuelle d'origine est supprimée juste après, sinon le même euro compterait
          deux fois. Créer d'abord, supprimer ensuite — l'inverse perdrait la saisie si
          la création échouait. */}
      <ProductDialog
        open={documenting !== null}
        onOpenChange={(next) => {
          if (!next) setDocumenting(null);
        }}
        defaults={
          documenting
            ? {
                name: documenting.label,
                value: documenting.amountCents / 100,
                receivedAt: documenting.date,
                channelId: documenting.channelId,
                videoId: documenting.videoId,
              }
            : undefined
        }
        onCreated={() => {
          if (documenting) remove.mutate(documenting.id);
          setDocumenting(null);
        }}
      />
    </div>
  );
};
