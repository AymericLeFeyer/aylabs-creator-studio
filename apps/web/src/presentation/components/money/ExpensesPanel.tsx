import { useMemo, useState } from 'react';
import { CalendarClock, Pencil, Plus, Repeat, Trash2 } from 'lucide-react';
import {
  useDeleteExpense,
  useExpenses,
} from '../../../application/expense/usecases/useExpenses.ts';
import { useUpcomingExpenses } from '../../../application/expense/usecases/useUpcoming.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import type { ExpenseEntry } from '../../../domain/expense/entities/Expense.ts';
import { UPCOMING_MONTHS } from '../../../domain/expense/services/upcoming.ts';
import { formatDate, formatMoney } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardHeader, CardTitle } from '../ui/card.tsx';
import { Checkbox } from '../ui/checkbox.tsx';
import { Label } from '../ui/label.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { ExpenseDialog } from '../forms/ExpenseDialog.tsx';
import { cn } from '../../../shared/cn.ts';

interface ExpenseRowProps {
  expense: ExpenseEntry;
  /** Ligne encore à venir : grisée, et signalée comme hors du total. */
  upcoming?: boolean;
  onEdit: (entry: ExpenseEntry) => void;
  onDelete: (entry: ExpenseEntry) => void;
}

/**
 * Une ligne de dépense.
 *
 * Les échéances à venir vivent dans **le même tableau** que les dépenses passées, en
 * tête et en grisé. Elles étaient dans un bloc séparé sous le tableau : on ne les voyait
 * qu'en défilant, exactement à l'inverse de ce qu'on leur demande. Dans le flux, triées
 * juste au-dessus d'aujourd'hui, elles se lisent comme la suite naturelle du calendrier
 * — sans jamais entrer dans le total, qui reste celui de la période.
 */
const ExpenseRow = ({ expense, upcoming, onEdit, onDelete }: ExpenseRowProps) => (
  <TableRow className={cn(upcoming && 'bg-muted/30 text-muted-foreground')}>
    <TableCell className="whitespace-nowrap tabular text-muted-foreground">
      <span className="flex items-center gap-1.5">
        {upcoming && <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />}
        {formatDate(expense.date)}
      </span>
    </TableCell>
    <TableCell className={cn('font-medium', upcoming && 'font-normal')}>
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
        <span className="block text-xs font-normal text-muted-foreground">{expense.notes}</span>
      )}
    </TableCell>
    <TableCell>
      <span className="flex items-center gap-2 text-sm">
        <span
          className={cn('h-2.5 w-2.5 rounded-full', upcoming && 'opacity-60')}
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
    <TableCell
      className={cn(
        'text-right font-medium tabular',
        upcoming ? 'text-muted-foreground' : 'text-[var(--expense)]',
      )}
    >
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
);

/**
 * Les dépenses de la période, précédées de ce qui arrive.
 *
 * Les échéances déjà datées en avant (impôts, abonnements, factures) **n'entrent pas
 * dans le total** : elles ne sont pas encore arrivées, et les compter fausserait le
 * bénéfice du mois. Mais les ignorer les faisait tomber par surprise — elles sont donc
 * dans le tableau, en tête et grisées, avec une case pour les masquer quand on veut
 * relire le mois seul.
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
  const [showUpcoming, setShowUpcoming] = useState(true);

  const total = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);

  // Les plus lointaines en haut : le tableau se lit du futur vers le passé, exactement
  // comme les dépenses de la période qui le suivent (date décroissante).
  const upcomingRows = useMemo(
    () => [...upcoming.expenses].sort((a, b) => b.date.localeCompare(a.date)),
    [upcoming.expenses],
  );

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

  const hasUpcoming = upcomingRows.length > 0;
  const visibleUpcoming = showUpcoming ? upcomingRows : [];

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

        <div className="flex flex-wrap items-center gap-3">
          {hasUpcoming && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-upcoming-expenses"
                checked={showUpcoming}
                onCheckedChange={(checked) => setShowUpcoming(checked === true)}
              />
              <Label
                htmlFor="show-upcoming-expenses"
                className="text-xs font-normal text-muted-foreground"
              >
                Afficher les {upcomingRows.length} dépense(s) à venir (
                {formatMoney(upcoming.summary.totalCents)})
              </Label>
            </div>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Ajouter une dépense
          </Button>
        </div>
      </div>

      {!isLoading && expenses.length === 0 && !hasUpcoming ? (
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
            {showUpcoming && hasUpcoming && (
              <p className="text-xs text-muted-foreground">
                Les {visibleUpcoming.length} première(s) ligne(s), grisées, sont à venir d'ici{' '}
                {UPCOMING_MONTHS} mois : déjà enregistrées, pas encore arrivées, et hors du total
                ci-dessus.
              </p>
            )}
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
              {visibleUpcoming.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  upcoming
                  onEdit={openEdit}
                  onDelete={confirmDelete}
                />
              ))}
              {expenses.map((expense) => (
                <ExpenseRow
                  key={expense.id}
                  expense={expense}
                  onEdit={openEdit}
                  onDelete={confirmDelete}
                />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <ExpenseDialog open={dialogOpen} onOpenChange={setDialogOpen} entry={editing} />
    </div>
  );
};
