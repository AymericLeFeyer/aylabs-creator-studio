import { useState } from 'react';
import { useBrands } from '../../../application/brand/usecases/useBrands.ts';
import { useChannels } from '../../../application/channel/usecases/useChannels.ts';
import { useProductions } from '../../../application/production/usecases/useProductions.ts';
import { useSponsorships } from '../../../application/sponsorship/usecases/useSponsorships.ts';
import {
  useCreateProduct,
  useUpdateProduct,
} from '../../../application/product/usecases/useProducts.ts';
import type { Product, ProductStatus } from '../../../domain/product/entities/Product.ts';
import {
  PRODUCT_STATUS_HINTS,
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUSES,
} from '../../../domain/product/entities/Product.ts';
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
import { fromSelectValue, NONE, toSelectValue } from './selectNone.ts';
import { SponsorshipLinkField } from './SponsorshipLinkField.tsx';
import {
  EMPTY_SPONSORSHIP_DRAFT,
  useResolveSponsorshipLink,
  type SponsorshipDraft,
} from './partnerLinks.ts';

interface ProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  /** Pré-remplit la vidéo quand le dialogue s'ouvre depuis une fiche de production. */
  defaultProductionId?: string | null;
  /** Pré-remplit la sponso quand le dialogue s'ouvre depuis une fiche de sponso. */
  defaultSponsorshipId?: string | null;
}

const EMPTY = {
  name: '',
  brandId: NONE,
  productionId: NONE,
  sponsorshipId: NONE,
  channelId: NONE,
  url: '',
  value: '',
  status: 'discussion' as ProductStatus,
  requestedAt: '',
  deadline: '',
  receivedAt: '',
  notes: '',
};

export const ProductDialog = ({
  open,
  onOpenChange,
  product,
  defaultProductionId,
  defaultSponsorshipId,
}: ProductDialogProps) => {
  const { data: brands = [] } = useBrands();
  const { data: channels = [] } = useChannels();
  const { data: productions = [] } = useProductions();
  const { data: sponsorships = [] } = useSponsorships();
  const create = useCreateProduct();
  const update = useUpdateProduct();
  const resolveSponsorship = useResolveSponsorshipLink();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [sponsorshipDraft, setSponsorshipDraft] =
    useState<SponsorshipDraft>(EMPTY_SPONSORSHIP_DRAFT);

  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${product?.id ?? 'new'}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setError(null);
    setSponsorshipDraft(EMPTY_SPONSORSHIP_DRAFT);
    setForm(
      product
        ? {
            name: product.name,
            brandId: toSelectValue(product.brandId),
            productionId: toSelectValue(product.productionId),
            sponsorshipId: toSelectValue(product.sponsorshipId),
            channelId: toSelectValue(product.channelId),
            url: product.url ?? '',
            value: product.valueCents ? String(product.valueCents / 100) : '',
            status: product.status,
            requestedAt: product.requestedAt ?? '',
            deadline: product.deadline ?? '',
            receivedAt: product.receivedAt ?? '',
            notes: product.notes ?? '',
          }
        : {
            ...EMPTY,
            productionId: toSelectValue(defaultProductionId),
            sponsorshipId: toSelectValue(defaultSponsorshipId),
          },
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const value = form.value ? Number(form.value.replace(',', '.')) : 0;
    if (!Number.isFinite(value) || value < 0) {
      setError('Saisis une valeur positive, ou laisse vide.');
      return;
    }

    const brandId = fromSelectValue(form.brandId);
    const productionId = fromSelectValue(form.productionId);
    const channelId = fromSelectValue(form.channelId);

    // La sponso est créée AVANT le produit quand on la saisit sur place : sans son
    // identifiant, le produit n'aurait rien à référencer.
    let sponsorshipId: string | null;
    try {
      sponsorshipId = await resolveSponsorship.resolve(form.sponsorshipId, sponsorshipDraft, {
        brandId,
        productionId,
        channelId,
      });
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : 'Création de la sponso impossible');
      return;
    }

    const payload = {
      name: form.name.trim(),
      brandId,
      productionId,
      sponsorshipId,
      channelId,
      url: form.url.trim() || null,
      value,
      status: form.status,
      requestedAt: form.requestedAt || null,
      deadline: form.deadline || null,
      // Reçu sans date : la valorisation a besoin d'un jour pour tomber dans une période.
      receivedAt:
        form.status === 'received'
          ? form.receivedAt || toIsoDate(new Date())
          : form.receivedAt || null,
      notes: form.notes.trim() || null,
    };

    try {
      if (product) await update.mutateAsync({ id: product.id, input: payload });
      else await create.mutateAsync(payload);
      onOpenChange(false);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  const pending = create.isPending || update.isPending || resolveSponsorship.isPending;
  const willValue = form.status === 'received' && Number(form.value.replace(',', '.')) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? 'Modifier le produit' : 'Nouveau produit'}</DialogTitle>
          <DialogDescription>
            Passé à « Reçu », il crée automatiquement un revenu en nature de sa valeur, rattaché à
            la chaîne et à la vidéo de sa production.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="product-name">Produit</Label>
            <Input
              id="product-name"
              placeholder="Casque, micro, jeu…"
              value={form.name}
              onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="product-brand">Marque</Label>
              <Select
                value={form.brandId}
                onValueChange={(value) => setForm((f) => ({ ...f, brandId: value }))}
              >
                <SelectTrigger id="product-brand">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sans marque</SelectItem>
                  {brands.map((brand) => (
                    <SelectItem key={brand.id} value={brand.id}>
                      {brand.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="product-status">Statut</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, status: value as ProductStatus }))
                }
              >
                <SelectTrigger id="product-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {PRODUCT_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{PRODUCT_STATUS_HINTS[form.status]}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="product-value">Valeur (€)</Label>
              <Input
                id="product-value"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0,00"
                value={form.value}
                onChange={(event) => setForm((f) => ({ ...f, value: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="product-channel">Chaîne</Label>
              <Select
                value={form.channelId}
                onValueChange={(value) => setForm((f) => ({ ...f, channelId: value }))}
              >
                <SelectTrigger id="product-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Celle de la vidéo</SelectItem>
                  {channels.map((channel) => (
                    <SelectItem key={channel.id} value={channel.id}>
                      {channel.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-production">Vidéo</Label>
            <Select
              value={form.productionId}
              onValueChange={(value) => setForm((f) => ({ ...f, productionId: value }))}
            >
              <SelectTrigger id="product-production">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Aucune</SelectItem>
                {productions.map((production) => (
                  <SelectItem key={production.id} value={production.id}>
                    {production.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              C'est elle qui porte la chaîne et la sortie : le revenu généré les reprendra.
            </p>
          </div>

          <SponsorshipLinkField
            value={form.sponsorshipId}
            onValueChange={(value, sponsorship) =>
              setForm((f) => ({
                ...f,
                sponsorshipId: value,
                // La sponso choisie complète ce qui est encore vide, sans jamais écraser
                // un choix déjà fait : c'est une suggestion, pas une reprise en main.
                brandId:
                  f.brandId === NONE && sponsorship?.brandId ? sponsorship.brandId : f.brandId,
                productionId:
                  f.productionId === NONE && sponsorship?.productionId
                    ? sponsorship.productionId
                    : f.productionId,
                channelId:
                  f.channelId === NONE && sponsorship?.channelId
                    ? sponsorship.channelId
                    : f.channelId,
              }))
            }
            draft={sponsorshipDraft}
            onDraftChange={setSponsorshipDraft}
            sponsorships={sponsorships}
            brandId={fromSelectValue(form.brandId)}
            productionId={fromSelectValue(form.productionId)}
          />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="product-requested">Demandé le</Label>
              <Input
                id="product-requested"
                type="date"
                value={form.requestedAt}
                onChange={(event) => setForm((f) => ({ ...f, requestedAt: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="product-deadline">Échéance</Label>
              <Input
                id="product-deadline"
                type="date"
                value={form.deadline}
                onChange={(event) => setForm((f) => ({ ...f, deadline: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="product-received">Reçu le</Label>
              <Input
                id="product-received"
                type="date"
                value={form.receivedAt}
                onChange={(event) => setForm((f) => ({ ...f, receivedAt: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-url">Lien</Label>
            <Input
              id="product-url"
              placeholder="https://…"
              value={form.url}
              onChange={(event) => setForm((f) => ({ ...f, url: event.target.value }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-notes">Notes</Label>
            <Textarea
              id="product-notes"
              placeholder="Conditions, ce que la marque attend…"
              value={form.notes}
              onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))}
            />
          </div>

          {willValue && (
            <p className="rounded-md bg-[var(--in-kind)]/10 px-3 py-2 text-xs text-[var(--in-kind)]">
              Un revenu en nature sera créé (ou mis à jour) à l'enregistrement. Il ne se modifie
              plus depuis l'écran Revenus : c'est cette fiche qui fait autorité.
            </p>
          )}

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
