import { useState } from 'react';
import { Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import {
  useDeleteExpense,
  useExpenses,
} from '../../../application/expense/usecases/useExpenses.ts';
import { useUpcomingExpenses } from '../../../application/expense/usecases/useUpcoming.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import type { ExpenseEntry } from '../../../domain/expense/entities/Expense.ts';
import { formatDate, formatMoney } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardHeader, CardTitle } from '../ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { ExpenseDialog } from '../forms/ExpenseDialog.tsx';
import { UpcomingSection } from './UpcomingSection.tsx';

interface ExpenseTableProps {
  entries: ExpenseEntry[];
  onEdit: (entry: ExpenseEntry) => void;
  onDelete: (entry: ExpenseEntry) => void;
}

/**
 * Le tableau des dépenses, partagé par la période et par le bloc « à venir ».
 *
 * Une seule définition : deux tableaux qui divergeraient d'une colonne rendraient la
 * comparaison entre ce qui est passé et ce qui arrive plus difficile qu'elle ne doit
 * l'être.
 */
const ExpenseTable = ({ entries, onEdit, onDelete }: ExpenseTableProps) => (
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
      {entries.map((expense) => (
        <TableRow key={expense.id}>
          <TableCell className="whitespace-nowrap text-muted-foreground tabular">
            {formatDate(expense.date)}
          </TableCell>
          <TableCell className="font-medium">
            {expense.label}
            {/* Une occurrence d'abonnement se corrige sur sa règle, pas ligne à ligne :
                la modifier ici serait réécrit à la prochaine projection. */}
            {expense.recurringId && (
              <span
                className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-normal text-muted-foreground"
                title="Engendrée par une dépense récurrente. Corrige-la dans Paramètres → Abonnements."
              >
                <Repeat className="h-3 w-3" aria-hidden />
                récurrente
              </span>
            )}
            {expense.notes && (
              <span className="block text-xs font-normal text-muted-foreground">
                {expense.notes}
              </span>
            )}
          </TableCell>
          <TableCell>
            <span className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: expense.categoryColor }}
                aria-hidden
              />
              {expense.categoryName}
            </span>
          </TableCell>
          <TableCell className="text-muted-foreground">{expense.channelName ?? 'Global'}</TableCell>
          <TableCell className="max-w-[14rem] text-muted-foreground">
            <span className="line-clamp-1" title={expense.videoTitle ?? undefined}>
              {expense.videoTitle ?? '—'}
            </span>
          </TableCell>
          <TableCell className="text-right tabular font-medium text-[var(--expense)]">
            −{formatMoney(expense.amountCents)}
          </TableCell>
          <TableCell>
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="icon" onClick={() => onEdit(expense)}>
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only">Modifier</span>
              </Button>
              <Button variant="ghost" size="icon" onClick={() => onDelete(expense)}>
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

/**
 * Les dépenses de la période, puis **ce qui arrive**.
 *
 * Les échéances déjà datées en avant (impôts, abonnements, factures) n'entrent pas dans
 * les cumuls de la période — elles ne sont pas encore arrivées. Les ignorer complètement
 * les faisait pourtant tomber par surprise : elles sont donc listées à part, sous un
 * bloc qui dit explicitement qu'il est hors total.
 */
export const ExpensesPanel = () => {
  const filters = useFilters();
  const { data: expenses = [], isLoading } = useExpenses({
    from: filters.from,
    to: filters.to,
    channelIds: filters.channelIds,
  });
  const upcoming = useUpcomingExpenses(filters.channelIds);
  const remove = useDeleteExpense();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseEntry | null>(null);

  const total = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (expense: ExpenseEntry) => {
    setEditing(expense);
    setDialogOpen(true);
  };

  const confirmDelete = (expense: ExpenseEntry) => {
    const warning = expense.recurringId
      ? `Supprimer « ${expense.label} » ? Cette échéance vient d'une dépense récurrente : elle sera recréée à la prochaine projection. Pour l'arrêter durablement, désactive la règle dans Paramètres → Abonnements.`
      : `Supprimer « ${expense.label} » ?`;
    if (window.confirm(warning)) remove.mutate(expense.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Total sur la période : </span>
          <span className="tabular font-semibold text-[var(--expense)]">{formatMoney(total)}</span>
          <span className="ml-3 text-xs text-muted-foreground">
            Déduit du CA en mode « Bénéfices »
          </span>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Ajouter une dépense
        </Button>
      </div>

      {!isLoading && expenses.length === 0 ? (
        <EmptyState
          title="Aucune dépense sur cette période"
          description="Saisis tes impôts, ton matériel ou tes abonnements pour que le mode « Bénéfices » du graphique en tienne compte."
          actionLabel="Ajouter une dépense"
          onAction={openCreate}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{expenses.length} dépense(s)</CardTitle>
          </CardHeader>
          <ExpenseTable entries={expenses} onEdit={openEdit} onDelete={confirmDelete} />
        </Card>
      )}

      <UpcomingSection
        kind="expense"
        count={upcoming.summary.count}
        totalCents={upcoming.summary.totalCents}
        from={formatDate(upcoming.range.from)}
        to={formatDate(upcoming.range.to)}
      >
        <ExpenseTable entries={upcoming.expenses} onEdit={openEdit} onDelete={confirmDelete} />
      </UpcomingSection>

      <ExpenseDialog open={dialogOpen} onOpenChange={setDialogOpen} entry={editing} />
    </div>
  );
};
