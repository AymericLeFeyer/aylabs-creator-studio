import { useMemo } from 'react';
import { Handshake } from 'lucide-react';
import type {
  Sponsorship,
  SponsorshipStatus,
} from '../../../domain/sponsorship/entities/Sponsorship.ts';
import {
  SPONSORSHIP_STATUS_LABELS,
  SPONSORSHIP_STATUSES,
} from '../../../domain/sponsorship/entities/Sponsorship.ts';
import { formatMoney } from '../../../shared/format.ts';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { NONE } from './selectNone.ts';
import { NEW_SPONSORSHIP, type SponsorshipDraft } from './partnerLinks.ts';

interface SponsorshipLinkFieldProps {
  /** `NONE`, `NEW_SPONSORSHIP`, ou l'identifiant d'une sponso existante. */
  value: string;
  onValueChange: (value: string, sponsorship: Sponsorship | null) => void;
  draft: SponsorshipDraft;
  onDraftChange: (draft: SponsorshipDraft) => void;
  sponsorships: Sponsorship[];
  /** Contexte du produit en cours de saisie : sert à remonter les sponsos pertinentes. */
  brandId: string | null;
  productionId: string | null;
}

/**
 * « Ce produit fait-il partie d'une sponso ? »
 *
 * Le lien est facultatif des deux côtés : un produit arrive souvent seul, une sponso
 * arrive souvent sans colis. Quand les deux vont ensemble, les saisir séparément est du
 * travail en double — d'où la création sur place plutôt qu'un aller-retour vers l'autre
 * écran, qui ferait perdre le formulaire en cours.
 *
 * Les sponsos de la même marque ou de la même vidéo remontent en tête : ce sont presque
 * toujours celles qu'on cherche. Elles sont **triées, pas filtrées** — un partenariat
 * peut très bien croiser deux marques.
 */
export const SponsorshipLinkField = ({
  value,
  onValueChange,
  draft,
  onDraftChange,
  sponsorships,
  brandId,
  productionId,
}: SponsorshipLinkFieldProps) => {
  const options = useMemo(() => {
    const score = (sponsorship: Sponsorship): number =>
      (sponsorship.brandId && sponsorship.brandId === brandId ? 2 : 0) +
      (sponsorship.productionId && sponsorship.productionId === productionId ? 1 : 0);
    return [...sponsorships].sort((a, b) => score(b) - score(a));
  }, [sponsorships, brandId, productionId]);

  const relevant = options.filter(
    (sponsorship) =>
      (sponsorship.brandId && sponsorship.brandId === brandId) ||
      (sponsorship.productionId && sponsorship.productionId === productionId),
  ).length;

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <div className="space-y-1.5">
        <Label htmlFor="product-sponsorship" className="flex items-center gap-2">
          <Handshake className="h-3.5 w-3.5" aria-hidden />
          Sponso associée
        </Label>
        <Select
          value={value}
          onValueChange={(next) =>
            onValueChange(
              next,
              next === NONE || next === NEW_SPONSORSHIP
                ? null
                : (sponsorships.find((s) => s.id === next) ?? null),
            )
          }
        >
          <SelectTrigger id="product-sponsorship">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Aucune — le produit arrive seul</SelectItem>
            <SelectItem value={NEW_SPONSORSHIP}>+ Créer une sponso</SelectItem>
            {options.map((sponsorship) => (
              <SelectItem key={sponsorship.id} value={sponsorship.id}>
                {sponsorship.label}
                {sponsorship.brandName ? ` · ${sponsorship.brandName}` : ''} ·{' '}
                {formatMoney(sponsorship.amountCents)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {relevant > 0
            ? `${relevant} sponso(s) de la même marque ou de la même vidéo en tête de liste.`
            : 'Facultatif. La valeur du produit et le montant de la sponso restent comptés séparément.'}
        </p>
      </div>

      {value === NEW_SPONSORSHIP && (
        <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_8rem_9rem]">
          <div className="space-y-1.5">
            <Label htmlFor="new-sponsorship-label">Libellé de la sponso</Label>
            <Input
              id="new-sponsorship-label"
              placeholder="Intégration 60 s…"
              value={draft.label}
              onChange={(event) => onDraftChange({ ...draft, label: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-sponsorship-amount">Montant (€)</Label>
            <Input
              id="new-sponsorship-amount"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0,00"
              value={draft.amount}
              onChange={(event) => onDraftChange({ ...draft, amount: event.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-sponsorship-status">Statut</Label>
            <Select
              value={draft.status}
              onValueChange={(status) =>
                onDraftChange({ ...draft, status: status as SponsorshipStatus })
              }
            >
              <SelectTrigger id="new-sponsorship-status">
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
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Elle héritera de la marque, de la vidéo et de la chaîne saisies ci-dessus. Le reste se
            complète dans l'onglet Sponsors.
          </p>
        </div>
      )}
    </div>
  );
};
