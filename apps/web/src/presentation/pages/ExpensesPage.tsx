import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useDeleteExpense, useExpenses } from '../../application/expense/usecases/useExpenses.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import type { ExpenseEntry } from '../../domain/expense/entities/Expense.ts';
import { formatDate, formatMoney } from '../../shared/format.ts';
import { Button } from '../components/ui/button.tsx';
import { Card, CardHeader, CardTitle } from '../components/ui/card.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx';
import { FiltersBar } from '../components/FiltersBar.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { ExpenseDialog } from '../components/forms/ExpenseDialog.tsx';

export const ExpensesPage = () => {
  const filters = useFilters();
  const { data: expenses = [], isLoading } = useExpenses({
    from: filters.from,
    to: filters.to,
    channelIds: filters.channelIds,
  });
  const remove = useDeleteExpense();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseEntry | null>(null);

  const total = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <FiltersBar />

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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Libellé</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Chaîne</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="whitespace-nowrap text-muted-foreground tabular">
                    {formatDate(expense.date)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {expense.label}
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
                  <TableCell className="text-muted-foreground">
                    {expense.channelName ?? 'Global'}
                  </TableCell>
                  <TableCell className="text-right tabular font-medium text-[var(--expense)]">
                    −{formatMoney(expense.amountCents)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(expense);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Modifier</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (window.confirm(`Supprimer « ${expense.label} » ?`)) {
                            remove.mutate(expense.id);
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

      <ExpenseDialog open={dialogOpen} onOpenChange={setDialogOpen} entry={editing} />
    </div>
  );
};
