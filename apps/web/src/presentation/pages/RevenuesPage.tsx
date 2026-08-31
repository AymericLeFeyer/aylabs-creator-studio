import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useDeleteRevenue, useRevenues } from '../../application/revenue/usecases/useRevenues.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import type { RevenueEntry } from '../../domain/revenue/entities/Revenue.ts';
import { NATURE_LABELS } from '../../domain/category/entities/Category.ts';
import { formatDate, formatMoney } from '../../shared/format.ts';
import { Button } from '../components/ui/button.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Card, CardHeader, CardTitle } from '../components/ui/card.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx';
import { RevenueDialog } from '../components/forms/RevenueDialog.tsx';
import { EmptyState } from '../components/EmptyState.tsx';

export const RevenuesPage = () => {
  const filters = useFilters();
  const { data: entries = [], isLoading } = useRevenues({
    from: filters.from,
    to: filters.to,
    channelIds: filters.channelIds,
  });
  const remove = useDeleteRevenue();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RevenueEntry | null>(null);

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
                    {entry.notes && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        {entry.notes}
                      </span>
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
                  <TableCell className="text-muted-foreground">
                    {entry.channelName ?? 'Global'}
                  </TableCell>
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
                      <Button variant="ghost" size="icon" onClick={() => openEdit(entry)}>
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Modifier</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (window.confirm(`Supprimer « ${entry.label} » ?`)) {
                            remove.mutate(entry.id);
                          }
                        }}
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
        </Card>
      )}

      <RevenueDialog open={dialogOpen} onOpenChange={setDialogOpen} entry={editing} />
    </div>
  );
};
