import { useState } from 'react';
import { Pause, Pencil, Play, Plus, Repeat, Trash2 } from 'lucide-react';
import {
  useDeleteRecurringExpense,
  useRecurringExpenses,
  useUpdateRecurringExpense,
} from '../../../application/expense/usecases/useExpenses.ts';
import type { RecurringExpense } from '../../../domain/expense/entities/RecurringExpense.ts';
import { FREQUENCY_LABELS } from '../../../domain/expense/entities/RecurringExpense.ts';
import { formatDate, formatMoney } from '../../../shared/format.ts';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Card, CardHeader, CardTitle } from '../ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { RecurringExpenseDialog } from '../forms/RecurringExpenseDialog.tsx';
import { cn } from '../../../shared/cn.ts';

/**
 * Les dépenses qui reviennent : abonnements, hébergement, assurances.
 *
 * Ce ne sont pas des lignes de dépense mais des **règles qui en engendrent**. L'API
 * garde toujours douze échéances d'avance, ce qui rend une année d'engagements visible
 * dans les dépenses à venir — c'est tout l'intérêt : un abonnement annuel de 240 € se
 * voit arriver, il ne tombe pas.
 *
 * Le total annualisé est en tête parce que c'est **le seul chiffre comparable** entre un
 * abonnement mensuel et une facture annuelle, et le seul qui réponde à « combien me
 * coûtent mes outils ».
 */
export const RecurringExpensesPanel = () => {
  const { data: rules = [], isLoading } = useRecurringExpenses();
  const update = useUpdateRecurringExpense();
  const remove = useDeleteRecurringExpense();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringExpense | null>(null);

  const active = rules.filter((rule) => rule.isActive);
  const yearly = active.reduce((total, rule) => total + rule.yearlyCents, 0);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          <span className="text-muted-foreground">Coût annualisé : </span>
          <span className="tabular font-semibold text-[var(--expense)]">{formatMoney(yearly)}</span>
          <span className="ml-3 text-xs text-muted-foreground">
            soit {formatMoney(Math.round(yearly / 12))} par mois, sur {active.length} règle(s)
            active(s)
          </span>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nouvelle dépense récurrente
        </Button>
      </div>

      {!isLoading && rules.length === 0 ? (
        <EmptyState
          title="Aucune dépense récurrente"
          description="Saisis tes abonnements une fois : les douze prochaines échéances sont créées automatiquement, et apparaissent dans les dépenses à venir."
          actionLabel="Ajouter un abonnement"
          onAction={openCreate}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Repeat className="h-4 w-4" />
              {rules.length} règle(s)
            </CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Libellé</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead>Fréquence</TableHead>
                <TableHead>Prochaine</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="text-right">Par an</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map((rule) => (
                <TableRow key={rule.id} className={cn(!rule.isActive && 'opacity-50')}>
                  <TableCell className="font-medium">
                    {rule.label}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {rule.channelName ?? 'Global'}
                      {rule.endDate && ` · jusqu'au ${formatDate(rule.endDate)}`}
                      {!rule.isActive && ' · arrêtée'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span className="flex items-center gap-2 text-sm">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: rule.categoryColor }}
                        aria-hidden
                      />
                      {rule.categoryName}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <Badge variant="secondary">{FREQUENCY_LABELS[rule.frequency]}</Badge>
                    <span className="ml-2 text-xs">le {rule.dayOfMonth}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular text-muted-foreground">
                    {rule.nextDate ? formatDate(rule.nextDate) : '—'}
                  </TableCell>
                  <TableCell className="text-right tabular font-medium text-[var(--expense)]">
                    {formatMoney(rule.amountCents)}
                  </TableCell>
                  <TableCell className="text-right tabular text-muted-foreground">
                    {formatMoney(rule.yearlyCents)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {/* Arrêter plutôt que supprimer : la règle cesse de projeter, et
                          les échéances déjà payées restent dans la comptabilité. */}
                      <Button
                        variant="ghost"
                        size="icon"
                        title={rule.isActive ? 'Arrêter' : 'Reprendre'}
                        onClick={() =>
                          update.mutate({ id: rule.id, input: { isActive: !rule.isActive } })
                        }
                      >
                        {rule.isActive ? (
                          <Pause className="h-3.5 w-3.5" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                        <span className="sr-only">{rule.isActive ? 'Arrêter' : 'Reprendre'}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(rule);
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
                          if (
                            window.confirm(
                              `Supprimer « ${rule.label} » ? Les échéances à venir partiront avec, celles déjà passées resteront dans les dépenses.`,
                            )
                          ) {
                            remove.mutate(rule.id);
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

      <RecurringExpenseDialog open={dialogOpen} onOpenChange={setDialogOpen} rule={editing} />
    </div>
  );
};
