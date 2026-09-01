import { useState } from 'react';
import { useBrands } from '../../../application/brand/usecases/useBrands.ts';
import { useChannels } from '../../../application/channel/usecases/useChannels.ts';
import { useProductions } from '../../../application/production/usecases/useProductions.ts';
import { useVideos } from '../../../application/video/usecases/useVideos.ts';
import { useProducts } from '../../../application/product/usecases/useProducts.ts';
import {
  useCreateSponsorship,
  useUpdateSponsorship,
} from '../../../application/sponsorship/usecases/useSponsorships.ts';
import type {
  Sponsorship,
  SponsorshipStatus,
} from '../../../domain/sponsorship/entities/Sponsorship.ts';
import {
  SPONSORSHIP_STATUS_HINTS,
  SPONSORSHIP_STATUS_LABELS,
  SPONSORSHIP_STATUSES,
} from '../../../domain/sponsorship/entities/Sponsorship.ts';
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
import { VideoTargetSelect } from './VideoTargetSelect.tsx';
import { fromTargetValue, PRODUCTION_PREFIX, targetToValue, toTargetValue } from './videoTarget.ts';
import { ProductLinkField } from './ProductLinkField.tsx';
import {
  EMPTY_PRODUCT_LINKS,
  useApplyProductLinks,
  type ProductLinkState,
} from './partnerLinks.ts';

interface SponsorshipDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sponsorship?: Sponsorship | null;
  defaultProductionId?: string | null;
}

const EMPTY = {
  label: '',
  brandId: NONE,
  target: NONE,
  channelId: NONE,
  amount: '',
  status: 'discussion' as SponsorshipStatus,
  deadline: '',
  paidAt: '',
  notes: '',
};

export const SponsorshipDialog = ({
  open,
  onOpenChange,
  sponsorship,
  defaultProductionId,
}: SponsorshipDialogProps) => {
  const { data: brands = [] } = useBrands();
  const { data: channels = [] } = useChannels();
  const { data: productions = [] } = useProductions();
  const { data: videos = [] } = useVideos();
  // Une seule liste sert le picker ET l'affichage des produits déjà rattachés : en
  // création, la sponso n'a pas d'identifiant à interroger de toute façon.
  const { data: products = [] } = useProducts();
  const create = useCreateSponsorship();
  const update = useUpdateSponsorship();
  const productLinks = useApplyProductLinks();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [links, setLinks] = useState<ProductLinkState>(EMPTY_PRODUCT_LINKS);

  const [lastKey, setLastKey] = useState<string | null>(null);
  const key = `${open}-${sponsorship?.id ?? 'new'}`;
  if (open && key !== lastKey) {
    setLastKey(key);
    setError(null);
    setLinks(EMPTY_PRODUCT_LINKS);
    setForm(
      sponsorship
        ? {
            label: sponsorship.label,
            brandId: toSelectValue(sponsorship.brandId),
            target: toTargetValue(sponsorship.productionId, sponsorship.videoId),
            channelId: toSelectValue(sponsorship.channelId),
            amount: sponsorship.amountCents ? String(sponsorship.amountCents / 100) : '',
            status: sponsorship.status,
            deadline: sponsorship.deadline ?? '',
            paidAt: sponsorship.paidAt ?? '',
            notes: sponsorship.notes ?? '',
          }
        : { ...EMPTY, target: toTargetValue(defaultProductionId, null) },
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const amount = form.amount ? Number(form.amount.replace(',', '.')) : 0;
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Saisis un montant positif, ou laisse vide.');
      return;
    }

    const brandId = fromSelectValue(form.brandId);
    // Un seul des deux est posé : le sélecteur ne propose qu'un rattachement à la fois.
    const { productionId, videoId } = fromTargetValue(form.target);
    const channelId = fromSelectValue(form.channelId);

    const payload = {
      label: form.label.trim(),
      brandId,
      productionId,
      videoId,
      channelId,
      amount,
      status: form.status,
      deadline: form.deadline || null,
      // Payée sans date : le revenu a besoin d'un jour pour tomber dans une période.
      paidAt: form.status === 'paid' ? form.paidAt || toIsoDate(new Date()) : form.paidAt || null,
      notes: form.notes.trim() || null,
    };

    try {
      // Les rattachements partent APRÈS l'écriture : en création, l'identifiant de la
      // sponso n'existe pas avant, et un produit ne peut pas référencer ce qui n'est
      // pas écrit.
      const saved = sponsorship
        ? await update.mutateAsync({ id: sponsorship.id, input: payload })
        : await create.mutateAsync(payload);

      await productLinks.apply(saved.id, links, { brandId, productionId, channelId });
      onOpenChange(false);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  const pending = create.isPending || update.isPending || productLinks.isPending;
  const willEarn = form.status === 'paid' && Number(form.amount.replace(',', '.')) > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{sponsorship ? 'Modifier la sponso' : 'Nouvelle sponso'}</DialogTitle>
          <DialogDescription>
            Passée à « Payée », elle crée automatiquement le revenu cash correspondant. Tant qu'elle
            ne l'est pas, son montant reste dans « à encaisser », jamais dans le CA.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sponsorship-label">Libellé</Label>
            <Input
              id="sponsorship-label"
              placeholder="Intégration 60 s, vidéo dédiée…"
              value={form.label}
              onChange={(event) => setForm((f) => ({ ...f, label: event.target.value }))}
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sponsorship-brand">Marque</Label>
              <Select
                value={form.brandId}
                onValueChange={(value) => setForm((f) => ({ ...f, brandId: value }))}
              >
                <SelectTrigger id="sponsorship-brand">
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
              <Label htmlFor="sponsorship-status">Statut</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, status: value as SponsorshipStatus }))
                }
              >
                <SelectTrigger id="sponsorship-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SPONSORSHIP_STATUSES.map((status) => (
                    <SelectItem key={status} value={status}>
                      {SPONSORSHIP_STATUS_LABELS[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {SPONSORSHIP_STATUS_HINTS[form.status]}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sponsorship-amount">Montant (€)</Label>
              <Input
                id="sponsorship-amount"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                placeholder="0,00"
                value={form.amount}
                onChange={(event) => setForm((f) => ({ ...f, amount: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sponsorship-channel">Chaîne</Label>
              <Select
                value={form.channelId}
                onValueChange={(value) => setForm((f) => ({ ...f, channelId: value }))}
              >
                <SelectTrigger id="sponsorship-channel">
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

          <VideoTargetSelect
            id="sponsorship-video"
            value={form.target}
            productions={productions}
            videos={videos}
            channelId={fromSelectValue(form.channelId)}
            onChange={(target) =>
              setForm((f) => ({
                ...f,
                target: targetToValue(target),
                channelId:
                  f.channelId === NONE && target.kind !== 'none' && target.channelId
                    ? target.channelId
                    : f.channelId,
              }))
            }
          />

          <ProductLinkField
            sponsorshipId={sponsorship?.id ?? null}
            products={products}
            state={links}
            onChange={setLinks}
            brandId={fromSelectValue(form.brandId)}
            productionId={
              form.target.startsWith(PRODUCTION_PREFIX)
                ? fromTargetValue(form.target).productionId
                : null
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sponsorship-deadline">Échéance de livraison</Label>
              <Input
                id="sponsorship-deadline"
                type="date"
                value={form.deadline}
                onChange={(event) => setForm((f) => ({ ...f, deadline: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="sponsorship-paid">Payée le</Label>
              <Input
                id="sponsorship-paid"
                type="date"
                value={form.paidAt}
                onChange={(event) => setForm((f) => ({ ...f, paidAt: event.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sponsorship-notes">Notes</Label>
            <Textarea
              id="sponsorship-notes"
              placeholder="Points à mentionner, contreparties, délai de paiement…"
              value={form.notes}
              onChange={(event) => setForm((f) => ({ ...f, notes: event.target.value }))}
            />
          </div>

          {willEarn && (
            <p className="rounded-md bg-[var(--positive)]/10 px-3 py-2 text-xs text-[var(--positive)]">
              Un revenu cash sera créé (ou mis à jour) à l'enregistrement. Il ne se modifie plus
              depuis l'écran Revenus : c'est cette fiche qui fait autorité.
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
