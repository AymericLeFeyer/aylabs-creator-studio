import { useState } from 'react';
import { useChannels } from '../../../application/channel/usecases/useChannels.ts';
import { useCategories } from '../../../application/category/usecases/useCategories.ts';
import {
  useCreateRecurringExpense,
  useUpdateRecurringExpense,
} from '../../../application/expense/usecases/useExpenses.ts';
import type { RecurringExpense } from '../../../domain/expense/entities/RecurringExpense.ts';
import {
  INTERVAL_PRESETS,
  intervalLabel,
} from '../../../domain/expense/entities/RecurringExpense.ts';
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

interface RecurringExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule?: RecurringExpense | null;
}

/**
 * Créer ou corriger une dépense qui revient.
 *
 * Un seul choix structurant : **la périodicité**, exprimée en mois (mensuelle,
 * trimestrielle, semestrielle, annuelle, tous les deux ans), plus le jour de
 * prélèvement. Tout le reste est une dépense ordinaire.
 *
 * La **première échéance ancre le rythme** : une règle tous les deux ans démarrée en
 * mars 2026 retombe en mars 2028. C'est pour ça qu'il n'y a plus de champ « mois » —
 * il ne disait rien que la date de début ne dise déjà.
 *
 * À l'enregistrement, l'API reprojette les échéances des douze prochains mois : corriger
 * un montant met à jour tout ce qui n'est pas encore passé, sans toucher aux mois clos.
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
    intervalMonths: '1',
    dayOfMonth: '1',
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
      intervalMonths: String(rule?.intervalMonths ?? 1),
      dayOfMonth: String(rule?.dayOfMonth ?? today.getDate()),
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
      intervalMonths: Number(form.intervalMonths),
      dayOfMonth: Number(form.dayOfMonth),
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
            Les échéances des douze prochains mois sont créées automatiquement — au minimum la
            prochaine — et apparaissent dans les dépenses à venir.
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
                value={form.intervalMonths}
                onValueChange={(value) => setForm((f) => ({ ...f, intervalMonths: value }))}
              >
                <SelectTrigger id="recurring-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_PRESETS.map((preset) => (
                    <SelectItem key={preset.months} value={String(preset.months)}>
                      {preset.label}
                    </SelectItem>
                  ))}
                  {/* Un rythme sans préréglage (18 mois, par exemple) reste sélectionnable
                      après coup : il vient de l'API, la liste ne doit pas l'effacer. */}
                  {!INTERVAL_PRESETS.some(
                    (preset) => String(preset.months) === form.intervalMonths,
                  ) && (
                    <SelectItem value={form.intervalMonths}>
                      {intervalLabel(Number(form.intervalMonths))}
                    </SelectItem>
                  )}
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
              <Label htmlFor="recurring-start">Première échéance</Label>
              <Input
                id="recurring-start"
                type="date"
                value={form.startDate}
                onChange={(event) => setForm((f) => ({ ...f, startDate: event.target.value }))}
                required
              />
              {/* C'est elle qui ancre le rythme : une règle tous les 2 ans démarrée en
                  mars 2026 retombe en mars 2028, pas en mars 2027. */}
              <p className="text-xs text-muted-foreground">Elle ancre le rythme.</p>
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
