import { useMemo } from 'react';
import { Gift, X } from 'lucide-react';
import type { Product, ProductStatus } from '../../../domain/product/entities/Product.ts';
import {
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUSES,
} from '../../../domain/product/entities/Product.ts';
import { formatMoney } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select.tsx';
import { NONE } from './selectNone.ts';
import { EMPTY_PRODUCT_DRAFT, type ProductLinkState } from './partnerLinks.ts';

interface ProductLinkFieldProps {
  /** `null` en création : la sponso n'a pas encore d'identifiant. */
  sponsorshipId: string | null;
  products: Product[];
  state: ProductLinkState;
  onChange: (state: ProductLinkState) => void;
  brandId: string | null;
  productionId: string | null;
}

/**
 * « Des produits sont-ils venus avec cette sponso ? »
 *
 * Le lien est un-à-plusieurs : une marque envoie parfois trois objets pour une seule
 * intégration. D'où une liste avec ajout et retrait, et non un simple `Select` — qui
 * obligerait à choisir lequel des trois compte.
 *
 * Les produits déjà rattachés à **une autre** sponso ne sont pas proposés : un produit
 * n'appartient qu'à un partenariat, et le proposer ici reviendrait à le voler en silence.
 */
export const ProductLinkField = ({
  sponsorshipId,
  products,
  state,
  onChange,
  brandId,
  productionId,
}: ProductLinkFieldProps) => {
  const linked = useMemo(
    () =>
      products.filter(
        (product) =>
          (product.sponsorshipId === sponsorshipId && sponsorshipId !== null) ||
          state.attachIds.includes(product.id),
      ),
    [products, sponsorshipId, state.attachIds],
  );

  const shown = linked.filter((product) => !state.detachIds.includes(product.id));

  const available = useMemo(() => {
    const score = (product: Product): number =>
      (product.brandId && product.brandId === brandId ? 2 : 0) +
      (product.productionId && product.productionId === productionId ? 1 : 0);

    return products
      .filter(
        (product) =>
          (product.sponsorshipId === null || state.detachIds.includes(product.id)) &&
          !state.attachIds.includes(product.id),
      )
      .sort((a, b) => score(b) - score(a));
  }, [products, state.attachIds, state.detachIds, brandId, productionId]);

  /** Retire de la vue : soit on annule un ajout en attente, soit on marque un détachement. */
  const remove = (product: Product) =>
    onChange(
      state.attachIds.includes(product.id)
        ? { ...state, attachIds: state.attachIds.filter((id) => id !== product.id) }
        : { ...state, detachIds: [...state.detachIds, product.id] },
    );

  return (
    <div className="space-y-3 rounded-md border border-border p-3">
      <Label className="flex items-center gap-2">
        <Gift className="h-3.5 w-3.5" aria-hidden />
        Produits venus avec cette sponso
      </Label>

      {shown.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {shown.map((product) => (
            <li
              key={product.id}
              className="flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-2.5 pr-1 text-xs"
            >
              <span>{product.name}</span>
              <span className="text-muted-foreground">{formatMoney(product.valueCents)}</span>
              <button
                type="button"
                onClick={() => remove(product)}
                className="rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                title="Détacher"
              >
                <X className="h-3 w-3" aria-hidden />
                <span className="sr-only">Détacher {product.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
        <Select
          value={NONE}
          onValueChange={(id) =>
            onChange({
              ...state,
              attachIds: [...state.attachIds, id],
              detachIds: state.detachIds.filter((pending) => pending !== id),
            })
          }
        >
          <SelectTrigger aria-label="Associer un produit existant">
            <SelectValue placeholder="Associer un produit existant" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} disabled>
              Associer un produit existant
            </SelectItem>
            {available.map((product) => (
              <SelectItem key={product.id} value={product.id}>
                {product.name}
                {product.brandName ? ` · ${product.brandName}` : ''} ·{' '}
                {formatMoney(product.valueCents)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          onClick={() =>
            onChange({ ...state, draft: state.draft ? null : { ...EMPTY_PRODUCT_DRAFT } })
          }
        >
          {state.draft ? 'Annuler' : '+ Créer un produit'}
        </Button>
      </div>

      {state.draft && (
        <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-[1fr_8rem_9rem]">
          <div className="space-y-1.5">
            <Label htmlFor="new-product-name">Produit</Label>
            <Input
              id="new-product-name"
              placeholder="Casque, micro, jeu…"
              value={state.draft.name}
              onChange={(event) =>
                onChange({ ...state, draft: { ...state.draft!, name: event.target.value } })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-product-value">Valeur (€)</Label>
            <Input
              id="new-product-value"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="0,00"
              value={state.draft.value}
              onChange={(event) =>
                onChange({ ...state, draft: { ...state.draft!, value: event.target.value } })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-product-status">Statut</Label>
            <Select
              value={state.draft.status}
              onValueChange={(status) =>
                onChange({ ...state, draft: { ...state.draft!, status: status as ProductStatus } })
              }
            >
              <SelectTrigger id="new-product-status">
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
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Il héritera de la marque, de la vidéo et de la chaîne saisies ci-dessus. En « Reçu », il
            créera son revenu en nature — la valeur du produit et le montant de la sponso restent
            comptés séparément.
          </p>
        </div>
      )}

      {shown.length === 0 && !state.draft && (
        <p className="text-xs text-muted-foreground">
          Facultatif : beaucoup de sponsos n'arrivent avec aucun colis.
        </p>
      )}
    </div>
  );
};
