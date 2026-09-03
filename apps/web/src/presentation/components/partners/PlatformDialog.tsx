import { useState } from 'react';
import { useBrands } from '../../../application/brand/usecases/useBrands.ts';
import {
  useCreatePlatform,
  useUpdatePlatform,
} from '../../../application/affiliate/usecases/usePlatforms.ts';
import type { AffiliatePlatform } from '../../../domain/affiliate/entities/AffiliatePlatform.ts';
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
import { cn } from '../../../shared/cn.ts';

const EMPTY = { name: '', description: '', url: '', imageUrl: '', color: '#64748b', notes: '' };

interface PlatformDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform?: AffiliatePlatform | null;
}

/**
 * Créer ou corriger une plateforme d'affiliation.
 *
 * Les marques se choisissent en **pastilles à cocher** plutôt qu'en liste déroulante
 * multiple : on en coche souvent trois d'affilée, et un `Select` multiple obligerait à
 * rouvrir le menu entre chaque. Elles restent **facultatives** — beaucoup de plateformes
 * n'ont aucune marque identifiée au moment où on les note.
 */
export const PlatformDialog = ({ open, onOpenChange, platform }: PlatformDialogProps) => {
  const { data: brands = [] } = useBrands();
  const create = useCreatePlatform();
  const update = useUpdatePlatform();

  const [form, setForm] = useState(EMPTY);
  const [brandIds, setBrandIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Recharge le formulaire à chaque ouverture, sans quoi l'édition afficherait les
  // valeurs de la plateforme précédente.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${platform?.id ?? 'new'}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setError(null);
    setForm({
      name: platform?.name ?? '',
      description: platform?.description ?? '',
      url: platform?.url ?? '',
      imageUrl: platform?.imageUrl ?? '',
      color: platform?.color ?? '#64748b',
      notes: platform?.notes ?? '',
    });
    setBrandIds((platform?.brands ?? []).map((brand) => brand.id));
  }

  const toggleBrand = (id: string) =>
    setBrandIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const url = form.url.trim();
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      // Une adresse sans protocole est le cas le plus fréquent quand on la recopie
      // depuis une barre d'adresse : on complète plutôt que de refuser.
      url: url ? (/^https?:\/\//i.test(url) ? url : `https://${url}`) : null,
      imageUrl: form.imageUrl.trim() || null,
      color: form.color,
      notes: form.notes.trim() || null,
      brandIds,
    };

    try {
      if (platform) await update.mutateAsync({ id: platform.id, input: payload });
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
          <DialogTitle>{platform ? 'Modifier la plateforme' : 'Nouvelle plateforme'}</DialogTitle>
          <DialogDescription>
            Rattache ensuite tes revenus d'affiliation à cette plateforme pour savoir ce qu'elle
            rapporte.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="platform-name">Nom</Label>
              <Input
                id="platform-name"
                placeholder="Amazon Partenaires, Awin, Effiliation…"
                value={form.name}
                onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="platform-color">Couleur</Label>
              <Input
                id="platform-color"
                type="color"
                className="h-9 w-20 p-1"
                value={form.color}
                onChange={(event) => setForm((f) => ({ ...f, color: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="platform-description">Description</Label>
            <Textarea
              id="platform-description"
              placeholder="Commission 3 %, paiement à 60 jours…"
              value={form.description}
              onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="platform-url">Lien</Label>
              <Input
                id="platform-url"
                placeholder="partenaires.amazon.fr"
                value={form.url}
                onChange={(event) => setForm((f) => ({ ...f, url: event.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="platform-image">Image</Label>
              <Input
                id="platform-image"
                placeholder="https://…/logo.png"
                value={form.imageUrl}
                onChange={(event) => setForm((f) => ({ ...f, imageUrl: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Marques disponibles sur cette plateforme</Label>
            {brands.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Aucune marque enregistrée. Elles se créent dans Paramètres → Marques, ou depuis un
                produit et une sponso.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {brands.map((brand) => {
                  const selected = brandIds.includes(brand.id);
                  return (
                    <button
                      key={brand.id}
                      type="button"
                      onClick={() => toggleBrand(brand.id)}
                      aria-pressed={selected}
                      className={cn(
                        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        selected
                          ? 'border-transparent text-foreground'
                          : 'border-dashed border-border text-muted-foreground hover:border-solid hover:text-foreground',
                      )}
                      style={selected ? { backgroundColor: `${brand.color}26` } : undefined}
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: brand.color }}
                        aria-hidden
                      />
                      {brand.name}
                    </button>
                  );
                })}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Facultatif. Une marque peut être présente sur plusieurs plateformes.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="platform-notes">Notes</Label>
            <Textarea
              id="platform-notes"
              placeholder="Identifiant de compte, contact, conditions particulières…"
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
