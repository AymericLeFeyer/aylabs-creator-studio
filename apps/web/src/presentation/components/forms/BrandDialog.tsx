import { useState } from 'react';
import { useCreateBrand, useUpdateBrand } from '../../../application/brand/usecases/useBrands.ts';
import type { Brand } from '../../../domain/brand/entities/Brand.ts';
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

interface BrandDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand?: Brand | null;
}

const EMPTY = {
  name: '',
  website: '',
  contactName: '',
  contactEmail: '',
  color: '#64748b',
  notes: '',
};

export const BrandDialog = ({ open, onOpenChange, brand }: BrandDialogProps) => {
  const create = useCreateBrand();
  const update = useUpdateBrand();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${brand?.id ?? 'new'}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setError(null);
    setForm(
      brand
        ? {
            name: brand.name,
            website: brand.website ?? '',
            contactName: brand.contactName ?? '',
            contactEmail: brand.contactEmail ?? '',
            color: brand.color,
            notes: brand.notes ?? '',
          }
        : EMPTY,
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const payload = {
      name: form.name.trim(),
      website: form.website.trim() || null,
      contactName: form.contactName.trim() || null,
      contactEmail: form.contactEmail.trim() || null,
      color: form.color,
      notes: form.notes.trim() || null,
    };

    try {
      if (brand) await update.mutateAsync({ id: brand.id, input: payload });
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
          <DialogTitle>{brand ? 'Modifier la marque' : 'Nouvelle marque'}</DialogTitle>
          <DialogDescription>
            Les produits et les sponsos se rattachent à une marque : c'est ce qui rend les
            classements du dashboard possibles.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="brand-name">Nom</Label>
              <Input
                id="brand-name"
                value={form.name}
                onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brand-color">Couleur</Label>
              <Input
                id="brand-color"
                type="color"
                className="h-9 p-1"
                value={form.color}
                onChange={(event) => setForm((f) => ({ ...f, color: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brand-contact">Contact</Label>
              <Input
                id="brand-contact"
                placeholder="Prénom Nom"
                value={form.contactName}
                onChange={(event) => setForm((f) => ({ ...f, contactName: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brand-email">E-mail</Label>
              <Input
                id="brand-email"
                type="email"
                value={form.contactEmail}
                onChange={(event) => setForm((f) => ({ ...f, contactEmail: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-website">Site</Label>
            <Input
              id="brand-website"
              placeholder="https://…"
              value={form.website}
              onChange={(event) => setForm((f) => ({ ...f, website: event.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brand-notes">Notes</Label>
            <Textarea
              id="brand-notes"
              placeholder="Conditions habituelles, délais de paiement…"
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
