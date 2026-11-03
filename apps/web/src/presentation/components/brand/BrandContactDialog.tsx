import { useState } from 'react';
import {
  useCreateBrandContact,
  useUpdateBrandContact,
} from '../../../application/brand/usecases/useBrands.ts';
import type { BrandContact } from '../../../domain/brand/entities/Brand.ts';
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

interface BrandContactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  contact?: BrandContact | null;
}

const EMPTY = { email: '', name: '', role: '', phone: '', notes: '' };

/** Ajouter ou compléter un contact du carnet d'une marque. */
export const BrandContactDialog = ({
  open,
  onOpenChange,
  brandId,
  contact,
}: BrandContactDialogProps) => {
  const create = useCreateBrandContact();
  const update = useUpdateBrandContact();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);

  // Formulaire réinitialisé à l'ouverture, dérivé pendant le rendu comme `BrandDialog`.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${contact?.id ?? 'new'}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setError(null);
    setForm(
      contact
        ? {
            email: contact.email,
            name: contact.name,
            role: contact.role,
            phone: contact.phone,
            notes: contact.notes,
          }
        : EMPTY,
    );
  }

  const field =
    (name: keyof typeof EMPTY) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((current) => ({ ...current, [name]: event.target.value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (contact) await update.mutateAsync({ id: contact.id, input: form });
      else await create.mutateAsync({ brandId, input: form });
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
          <DialogTitle>{contact ? 'Modifier le contact' : 'Nouveau contact'}</DialogTitle>
          <DialogDescription>
            Les interlocuteurs d'un fil de mails rattaché à la marque arrivent ici tout seuls ;
            complète leur poste ou ajoute quelqu'un que tu n'as pas encore croisé par mail.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact-name">Nom</Label>
              <Input
                id="contact-name"
                placeholder="Prénom Nom"
                value={form.name}
                onChange={field('name')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-role">Poste</Label>
              <Input
                id="contact-role"
                placeholder="Partenariats, RP…"
                value={form.role}
                onChange={field('role')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">E-mail</Label>
              <Input
                id="contact-email"
                type="email"
                required
                value={form.email}
                onChange={field('email')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">Téléphone</Label>
              <Input id="contact-phone" type="tel" value={form.phone} onChange={field('phone')} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contact-notes">Notes</Label>
            <Textarea
              id="contact-notes"
              placeholder="Rencontrée au salon, préfère le téléphone…"
              value={form.notes}
              onChange={field('notes')}
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
