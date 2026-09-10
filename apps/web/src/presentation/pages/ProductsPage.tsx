import { useMemo, useState } from 'react';
import {
  Clapperboard,
  Gift,
  Handshake,
  PackageOpen,
  Pencil,
  Plus,
  Trash2,
  Truck,
} from 'lucide-react';
import { useDeleteProduct, useProducts } from '../../application/product/usecases/useProducts.ts';
import type { Product } from '../../domain/product/entities/Product.ts';
import {
  PENDING_PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
} from '../../domain/product/entities/Product.ts';
import {
  partnerPipeline,
  productInPeriod,
  productIsOutstanding,
} from '../../domain/partner/services/pipeline.ts';
import { NATURE_LABELS } from '../../domain/category/entities/Category.ts';
import { formatDate, formatNumber, toIsoDate } from '../../shared/format.ts';
import { usePrivacy } from '../hooks/usePrivacy.tsx';
import { useFilters } from '../hooks/useFilters.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card, CardHeader, CardTitle } from '../components/ui/card.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { PageAlerts } from '../components/PageAlerts.tsx';
import { PeriodPicker } from '../components/filters/PeriodPicker.tsx';
import { ProductDialog } from '../components/forms/ProductDialog.tsx';
import {
  DeadlineCell,
  LinkedVideoCell,
  OutstandingToggle,
} from '../components/partners/PartnerCells.tsx';

/**
 * Les produits reçus des marques : ce qui arrive, ce qui est arrivé, et ce qu'il reste à
 * tourner.
 *
 * Ancien onglet de `/partenariats`, devenu un écran à part : la question qu'on s'y pose
 * (« qu'est-ce que je dois filmer ? ») n'est pas celle des sponsors (« qui dois-je
 * relancer ? »), et chacun porte désormais sa propre pastille dans le menu.
 *
 * **Les quatre cartes parlent de produits et de rien d'autre.** Deux états, qui ignorent
 * la période parce qu'un colis attendu depuis mars l'est toujours en juin (« Attendus »,
 * « À tourner »), et un flux borné par elle (« Reçus sur la période »). La valeur attendue
 * dit ce qui est en jeu dans le pipeline, sans être encore comptée nulle part.
 */
export const ProductsPage = () => {
  const privacy = usePrivacy();
  const filters = useFilters();
  const { data: products = [] } = useProducts();
  const remove = useDeleteProduct();

  const range = useMemo(() => ({ from: filters.from, to: filters.to }), [filters.from, filters.to]);
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  /**
   * Filtré ici et non dans l'API : `/api/products` alimente aussi les sélecteurs de
   * rattachement, qui doivent tout voir. Le prédicat est celui du pipeline, si bien que
   * le total annoncé retombe sur les lignes affichées.
   */
  const visible = useMemo(
    () =>
      products.filter(
        (product) =>
          productInPeriod(product, range) && (!outstandingOnly || productIsOutstanding(product)),
      ),
    [products, range, outstandingOnly],
  );

  const stats = useMemo(() => {
    const pipeline = partnerPipeline(products, [], toIsoDate(new Date()), range);
    const pending = products.filter((product) => PENDING_PRODUCT_STATUSES.includes(product.status));
    return {
      pipeline,
      shipped: pending.filter((product) => product.status === 'shipped').length,
      pendingValueCents: pending.reduce((total, product) => total + product.valueCents, 0),
      /** Arrivés, mais la vidéo n'est pas en ligne : c'est le travail qui attend. */
      toShoot: products.filter(
        (product) => product.status === 'received' && productIsOutstanding(product),
      ).length,
    };
  }, [products, range]);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">Produits</h1>
          <p className="text-sm text-muted-foreground">
            Un produit reçu alimente tes revenus en nature automatiquement — pas de double saisie,
            et pas de double comptage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <OutstandingToggle
            id="products-outstanding-only"
            checked={outstandingOnly}
            onChange={setOutstandingOnly}
            hint="Les produits dont la vidéo n’est pas encore publiée"
          />
          <PeriodPicker />
        </div>
      </div>

      <PageAlerts path="/produits" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Attendus"
          value={formatNumber(stats.pipeline.productsPending)}
          hint={
            stats.pipeline.productsLate > 0
              ? `${stats.pipeline.productsLate} en retard · toutes périodes`
              : `${stats.shipped} expédié(s) · toutes périodes`
          }
          icon={<PackageOpen className="h-4 w-4" />}
          accent={stats.pipeline.productsLate > 0 ? 'var(--negative)' : undefined}
        />
        <StatCard
          label="Valeur attendue"
          value={privacy.money(stats.pendingValueCents, 'inKind')}
          hint="pas encore arrivée, donc pas encore comptée"
          icon={<Truck className="h-4 w-4" />}
        />
        <StatCard
          label={`${NATURE_LABELS.in_kind} sur la période`}
          value={privacy.money(stats.pipeline.productsReceivedCents, 'inKind')}
          hint={`${stats.pipeline.productsReceived} produit(s) reçu(s)`}
          icon={<Gift className="h-4 w-4" />}
          accent={stats.pipeline.productsReceivedCents > 0 ? 'var(--in-kind)' : undefined}
        />
        <StatCard
          label="À tourner"
          value={formatNumber(stats.toShoot)}
          hint="reçus, vidéo pas encore publiée"
          icon={<Clapperboard className="h-4 w-4" />}
          accent={stats.toShoot > 0 ? 'var(--expense)' : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Filtré sur le reste à faire, le total change de nature avec la table : il ne
            parle plus de ce qui est arrivé, mais de ce qui n'est pas encore intégré. */}
        {outstandingOnly ? (
          <p className="text-sm">
            <span className="text-muted-foreground">Valeur restant à intégrer : </span>
            <span className="tabular font-semibold text-[var(--in-kind)]">
              {privacy.money(
                visible.reduce((total, product) => total + product.valueCents, 0),
                'inKind',
              )}
            </span>
          </p>
        ) : (
          <p className="text-sm">
            <span className="text-muted-foreground">Valeur reçue sur la période : </span>
            <span className="tabular font-semibold text-[var(--in-kind)]">
              {privacy.money(stats.pipeline.productsReceivedCents, 'inKind')}
            </span>
          </p>
        )}
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Ajouter un produit
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{visible.length} produit(s)</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Produit</TableHead>
              <TableHead>Marque</TableHead>
              <TableHead>Statut</TableHead>
              <TableHead>Échéance</TableHead>
              <TableHead>Reçu le</TableHead>
              <TableHead>Vidéo</TableHead>
              <TableHead className="text-right">Valeur</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((product) => (
              <TableRow key={product.id}>
                {/* Le partenariat est un détail de la ligne, pas une dimension à
                    balayer : une sous-ligne plutôt qu'une neuvième colonne. */}
                <TableCell className="font-medium">
                  {product.url ? (
                    <a
                      href={product.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {product.name}
                    </a>
                  ) : (
                    product.name
                  )}
                  {product.sponsorshipLabel && (
                    <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                      <Handshake className="h-3 w-3" aria-hidden />
                      {product.sponsorshipLabel}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {product.brandName ? (
                    <span className="flex items-center gap-2 text-sm">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: product.brandColor ?? '#94a3b8' }}
                        aria-hidden
                      />
                      {product.brandName}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant={product.status === 'received' ? 'inKind' : 'secondary'}>
                    {PRODUCT_STATUS_LABELS[product.status]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <DeadlineCell
                    date={product.deadline}
                    pending={PENDING_PRODUCT_STATUSES.includes(product.status)}
                  />
                </TableCell>
                <TableCell className="tabular text-muted-foreground">
                  {product.receivedAt ? formatDate(product.receivedAt) : '—'}
                </TableCell>
                <TableCell className="max-w-[12rem] text-muted-foreground">
                  <LinkedVideoCell
                    productionId={product.productionId}
                    productionTitle={product.productionTitle}
                    productionStatus={product.productionStatus}
                    videoTitle={product.videoTitle}
                  />
                </TableCell>
                <TableCell className="text-right tabular font-medium text-[var(--in-kind)]">
                  {privacy.money(product.valueCents, 'inKind')}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditing(product);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      <span className="sr-only">Modifier</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (window.confirm(`Supprimer « ${product.name} » ?`)) {
                          remove.mutate(product.id);
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      <span className="sr-only">Supprimer</span>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <ProductDialog open={dialogOpen} onOpenChange={setDialogOpen} product={editing} />
    </div>
  );
};
