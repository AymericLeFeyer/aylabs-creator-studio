import { useState } from 'react';
import { useChannels } from '../../../application/channel/usecases/useChannels.ts';
import {
  useCreateRevenue,
  useUpdateRevenue,
} from '../../../application/revenue/usecases/useRevenues.ts';
import { useCategories } from '../../../application/category/usecases/useCategories.ts';
import type { RevenueEntry } from '../../../domain/revenue/entities/Revenue.ts';
import { NATURE_LABELS } from '../../../domain/category/entities/Category.ts';
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

/** Valeur du Select pour « aucune chaîne » : Radix refuse une valeur vide. */
const NO_CHANNEL = '__none__';

interface RevenueDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Renseigné pour une modification, absent pour une création. */
  entry?: RevenueEntry | null;
}

export const RevenueDialog = ({ open, onOpenChange, entry }: RevenueDialogProps) => {
  // Seules les catégories ouvertes aux revenus : « Impôts » n'a rien à faire ici.
  const { data: categories = [] } = useCategories({ scope: 'revenue' });
  const { data: channels = [] } = useChannels();
  const create = useCreateRevenue();
  const update = useUpdateRevenue();

  // Les catégories automatiques (AdSense) sont exclues : leur montant vient de la collecte.
  const selectable = categories.filter((category) => !category.isAuto);

  const [form, setForm] = useState({
    categoryId: '',
    channelId: NO_CHANNEL,
    date: toIsoDate(new Date()),
    amount: '',
    label: '',
    notes: '',
  });
  const [error, setError] = useState<string | null>(null);

  // Réinitialisation au rendu plutôt que dans un effet : le formulaire est prêt dès la
  // première peinture, sans le rendu intermédiaire avec les valeurs de l'entrée précédente.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${entry?.id ?? 'new'}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setError(null);
    setForm({
      categoryId: entry?.categoryId ?? selectable[0]?.id ?? '',
      channelId: entry?.channelId ?? NO_CHANNEL,
      date: entry?.date ?? toIsoDate(new Date()),
      amount: entry ? String(entry.amountCents / 100) : '',
      label: entry?.label ?? '',
      notes: entry?.notes ?? '',
    });
  }

  const selectedCategory = categories.find((category) => category.id === form.categoryId);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const amount = Number(form.amount.replace(',', '.'));
    if (!Number.isFinite(amount)) {
      setError('Montant invalide');
      return;
    }
    if (!form.categoryId) {
      setError('Choisis une catégorie');
      return;
    }

    const payload = {
      categoryId: form.categoryId,
      channelId: form.channelId === NO_CHANNEL ? null : form.channelId,
      date: form.date,
      amount,
      label: form.label.trim(),
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
          <DialogTitle>{entry ? 'Modifier le revenu' : 'Nouveau revenu'}</DialogTitle>
          <DialogDescription>
            Les revenus AdSense sont collectés automatiquement et ne se saisissent pas ici.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="revenue-category">Catégorie</Label>
              <Select
                value={form.categoryId}
                onValueChange={(value) => setForm((f) => ({ ...f, categoryId: value }))}
              >
                <SelectTrigger id="revenue-category">
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  {selectable.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name} · {NATURE_LABELS[category.nature]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="revenue-channel">Chaîne</Label>
              <Select
                value={form.channelId}
                onValueChange={(value) => setForm((f) => ({ ...f, channelId: value }))}
              >
                <SelectTrigger id="revenue-channel">
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
              <Label htmlFor="revenue-date">Date</Label>
              <Input
                id="revenue-date"
                type="date"
                value={form.date}
                onChange={(event) => setForm((f) => ({ ...f, date: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="revenue-amount">Montant (€)</Label>
              <Input
                id="revenue-amount"
                type="number"
                step="0.01"
                inputMode="decimal"
                placeholder="0,00"
                value={form.amount}
                onChange={(event) => setForm((f) => ({ ...f, amount: event.target.value }))}
                required
              />
            </div>
          </div>

          {selectedCategory?.nature === 'in_kind' && (
            <p className="rounded-md bg-[var(--in-kind)]/10 px-3 py-2 text-xs text-[var(--in-kind)]">
              Avantage en nature : compté dans les gains, mais jamais dans l'argent encaissé ni
              déduit par les dépenses.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="revenue-label">Libellé</Label>
            <Input
              id="revenue-label"
              placeholder="Sponso NordVPN, micro offert…"
              value={form.label}
              onChange={(event) => setForm((f) => ({ ...f, label: event.target.value }))}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="revenue-notes">Notes</Label>
            <Textarea
              id="revenue-notes"
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
