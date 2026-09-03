import { useState } from 'react';
import { useChannels } from '../../../application/channel/usecases/useChannels.ts';
import { useCategories } from '../../../application/category/usecases/useCategories.ts';
import {
  useCreateRecurringExpense,
  useUpdateRecurringExpense,
} from '../../../application/expense/usecases/useExpenses.ts';
import type {
  RecurrenceFrequency,
  RecurringExpense,
} from '../../../domain/expense/entities/RecurringExpense.ts';
import { FREQUENCY_LABELS } from '../../../domain/expense/entities/RecurringExpense.ts';
import { toIsoDate } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { Input, Textarea } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { NONE, fromSelectValue, toSelectValue } from './selectNone.ts';

const MONTHS = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
];

interface RecurringExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: RecurringExpense | null;
}

/**
 * Créer ou corriger une dépense qui revient.
 *
 * Un seul choix structurant : **mensuelle ou annuelle**, plus le jour. Tout le reste est
 * une dépense ordinaire. À l'enregistrement, l'API reprojette les douze prochaines
 * échéances — corriger un montant met donc à jour tout ce qui n'est pas encore passé,
 * sans toucher aux mois déjà clos.
 */
export const RecurringExpenseDialog = ({
  open,
  onOpenChange,
  rule,
}: RecurringExpenseDialogProps) => {
  // Seules les catégories ouvertes aux dépenses : « Affiliation » n'a rien à faire ici.
  const { data: categories = [] } = useCategories({ scope: 'expense' });
  const { data: channels = [] } = useChannels();
  const create = useCreateRecurringExpense();
  const update = useUpdateRecurringExpense();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    categoryId: '',
    label: '',
    amount: '',
    frequency: 'monthly' as RecurrenceFrequency,
    dayOfMonth: '1',
    monthOfYear: '1',
    startDate: toIsoDate(new Date()),
    endDate: '',
    channelId: NONE,
    notes: '',
  });

  // Recharge le formulaire à chaque ouverture, sans quoi l'édition afficherait
  // les valeurs de la règle précédente.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${rule?.id ?? 'new'}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setError(null);
    const today = new Date();
    setForm({
      categoryId: rule?.categoryId ?? categories[0]?.id ?? '',
      label: rule?.label ?? '',
      amount: rule ? String(rule.amountCents / 100) : '',
      frequency: rule?.frequency ?? 'monthly',
      dayOfMonth: String(rule?.dayOfMonth ?? today.getDate()),
      monthOfYear: String(rule?.monthOfYear ?? today.getMonth() + 1),
      startDate: rule?.startDate ?? toIsoDate(today),
      endDate: rule?.endDate ?? '',
      channelId: toSelectValue(rule?.channelId),
      notes: rule?.notes ?? '',
    });
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const amount = Number(form.amount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Saisis un montant positif.');
      return;
    }
    if (!form.categoryId) {
      setError('Choisis une catégorie');
      return;
    }

    const payload = {
      categoryId: form.categoryId,
      label: form.label.trim(),
      amount,
      frequency: form.frequency,
      dayOfMonth: Number(form.dayOfMonth),
      // Le mois ne sert qu'aux échéances annuelles : le poser sur une mensuelle
      // n'aurait aucun effet et laisserait croire le contraire.
      monthOfYear: form.frequency === 'yearly' ? Number(form.monthOfYear) : null,
      startDate: form.startDate,
      endDate: form.endDate || null,
      channelId: fromSelectValue(form.channelId),
      notes: form.notes.trim() || null,
    };

    try {
      if (rule) await update.mutateAsync({ id: rule.id, input: payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {rule ? 'Modifier la dépense récurrente' : 'Nouvelle dépense récurrente'}
          </DialogTitle>
          <DialogDescription>
            Les douze prochaines échéances sont créées automatiquement, et apparaissent dans les
            dépenses à venir.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="recurring-label">Libellé</Label>
            <Input
              id="recurring-label"
              placeholder="Adobe Creative Cloud, hébergement, assurance…"
              value={form.label}
              onChange={(event) => setForm((f) => ({ ...f, label: event.target.value }))}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="recurring-category">Catégorie</Label>
              <Select
                value={form.categoryId}
                onValueChange={(value) => setForm((f) => ({ ...f, categoryId: value }))}
              >
                <SelectTrigger id="recurring-category">
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recurring-amount">Montant (€)</Label>
              <Input
                id="recurring-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0,00"
                value={form.amount}
                onChange={(event) => setForm((f) => ({ ...f, amount: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recurring-frequency">Fréquence</Label>
              <Select
                value={form.frequency}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, frequency: value as RecurrenceFrequency }))
                }
              >
                <SelectTrigger id="recurring-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(FREQUENCY_LABELS) as RecurrenceFrequency[]).map((frequency) => (
                    <SelectItem key={frequency} value={frequency}>
                      {FREQUENCY_LABELS[frequency]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recurring-day">Jour du prélèvement</Label>
              <Input
                id="recurring-day"
                type="number"
                min={1}
                max={31}
                value={form.dayOfMonth}
                onChange={(event) => setForm((f) => ({ ...f, dayOfMonth: event.target.value }))}
                required
              />
            </div>

            {/* Le mois n'apparaît que pour une échéance annuelle : sur une mensuelle,
                il n'aurait rien à décider. */}
            {form.frequency === 'yearly' && (
              <div className="space-y-1.5">
                <Label htmlFor="recurring-month">Mois</Label>
                <Select
                  value={form.monthOfYear}
                  onValueChange={(value) => setForm((f) => ({ ...f, monthOfYear: value }))}
                >
                  <SelectTrigger id="recurring-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((month, index) => (
                      <SelectItem key={month} value={String(index + 1)}>
                        {month}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="recurring-channel">Chaîne</Label>
              <Select
                value={form.channelId}
                onValueChange={(value) => setForm((f) => ({ ...f, channelId: value }))}
              >
                <SelectTrigger id="recurring-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucune (global)</SelectItem>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recurring-start">Début</Label>
              <Input
                id="recurring-start"
                type="date"
                value={form.startDate}
                onChange={(event) => setForm((f) => ({ ...f, startDate: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recurring-end">Fin (facultatif)</Label>
              <Input
                id="recurring-end"
                type="date"
                value={form.endDate}
                onChange={(event) => setForm((f) => ({ ...f, endDate: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="recurring-notes">Notes</Label>
            <Textarea
              id="recurring-notes"
              placeholder="Facultatif"
              value={form.notes}
              onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
