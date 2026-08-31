import { useState } from 'react';
import { useChannels } from '../../../application/channel/usecases/useChannels.ts';
import { useCategories } from '../../../application/category/usecases/useCategories.ts';
import {
  useCreateExpense,
  useUpdateExpense,
} from '../../../application/expense/usecases/useExpenses.ts';
import type { ExpenseEntry } from '../../../domain/expense/entities/Expense.ts';
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
import { NO_VIDEO, VideoSelect } from './VideoSelect.tsx';

/** Valeur du Select pour « aucune chaîne » : Radix refuse une valeur vide. */
const NO_CHANNEL = '__none__';

interface ExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entry?: ExpenseEntry | null;
}

export const ExpenseDialog = ({ open, onOpenChange, entry }: ExpenseDialogProps) => {
  // Seules les catégories ouvertes aux dépenses : « Affiliation » n'a rien à faire ici.
  const { data: categories = [] } = useCategories({ scope: 'expense' });
  const { data: channels = [] } = useChannels();
  const create = useCreateExpense();
  const update = useUpdateExpense();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    categoryId: '',
    date: toIsoDate(new Date()),
    amount: '',
    label: '',
    channelId: NO_CHANNEL,
    videoId: NO_VIDEO,
    notes: '',
  });

  // Recharge le formulaire à chaque ouverture, sans quoi l'édition afficherait
  // les valeurs de l'entrée précédente.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${entry?.id ?? 'new'}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setError(null);
    setForm({
      categoryId: entry?.categoryId ?? categories[0]?.id ?? '',
      date: entry?.date ?? toIsoDate(new Date()),
      amount: entry ? String(entry.amountCents / 100) : '',
      label: entry?.label ?? '',
      channelId: entry?.channelId ?? NO_CHANNEL,
      videoId: entry?.videoId ?? NO_VIDEO,
      notes: entry?.notes ?? '',
    });
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const amount = Number(form.amount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Saisis un montant positif : la soustraction est faite par le calcul du bénéfice.');
      return;
    }
    if (!form.categoryId) {
      setError('Choisis une catégorie');
      return;
    }

    const payload = {
      categoryId: form.categoryId,
      date: form.date,
      amount,
      label: form.label.trim(),
      channelId: form.channelId === NO_CHANNEL ? null : form.channelId,
      videoId: form.videoId === NO_VIDEO ? null : form.videoId,
      notes: form.notes.trim() || null,
    };

    try {
      if (entry) await update.mutateAsync({ id: entry.id, input: payload });
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
          <DialogTitle>{entry ? 'Modifier la dépense' : 'Nouvelle dépense'}</DialogTitle>
          <DialogDescription>
            Montant positif : il est retranché du chiffre d'affaires en mode « Bénéfices ».
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="expense-category">Catégorie</Label>
              <Select
                value={form.categoryId}
                onValueChange={(value) => setForm((f) => ({ ...f, categoryId: value }))}
              >
                <SelectTrigger id="expense-category">
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
              <Label htmlFor="expense-channel">Chaîne</Label>
              <Select
                value={form.channelId}
                onValueChange={(value) =>
                  setForm((f) => ({
                    // Une vidéo appartient à une chaîne : changer de chaîne la détache.
                    ...f,
                    channelId: value,
                    videoId: value === f.channelId ? f.videoId : NO_VIDEO,
                  }))
                }
              >
                <SelectTrigger id="expense-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CHANNEL}>Aucune (global)</SelectItem>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-date">Date</Label>
              <Input
                id="expense-date"
                type="date"
                value={form.date}
                onChange={(event) => setForm((f) => ({ ...f, date: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expense-amount">Montant (€)</Label>
              <Input
                id="expense-amount"
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
          </div>

          <VideoSelect
            id="expense-video"
            value={form.videoId}
            channelId={form.channelId === NO_CHANNEL ? null : form.channelId}
            onChange={(value, video) =>
              setForm((f) => ({
                ...f,
                videoId: value,
                channelId: video ? video.channelId : f.channelId,
              }))
            }
          />

          <div className="space-y-1.5">
            <Label htmlFor="expense-label">Libellé</Label>
            <Input
              id="expense-label"
              placeholder="URSSAF T3, micro Shure, abonnement Adobe…"
              value={form.label}
              onChange={(event) => setForm((f) => ({ ...f, label: event.target.value }))}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="expense-notes">Notes</Label>
            <Textarea
              id="expense-notes"
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
