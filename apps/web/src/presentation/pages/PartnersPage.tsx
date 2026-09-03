import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileText, Gift, Handshake, Pencil, Plus, Trash2 } from 'lucide-react';
import { useDeleteProduct, useProducts } from '../../application/product/usecases/useProducts.ts';
import {
  useDeleteSponsorship,
  useSponsorships,
} from '../../application/sponsorship/usecases/useSponsorships.ts';
import type { Product } from '../../domain/product/entities/Product.ts';
import {
  PENDING_PRODUCT_STATUSES,
  PRODUCT_STATUS_LABELS,
} from '../../domain/product/entities/Product.ts';
import type { Sponsorship } from '../../domain/sponsorship/entities/Sponsorship.ts';
import {
  PENDING_SPONSORSHIP_STATUSES,
  SPONSORSHIP_STATUS_LABELS,
} from '../../domain/sponsorship/entities/Sponsorship.ts';
import { partnerPipeline } from '../../domain/partner/services/pipeline.ts';
import { formatDate, formatMoney, toIsoDate } from '../../shared/format.ts';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { PlatformsPanel } from '../components/partners/PlatformsPanel.tsx';
import { PartnerStatCards } from '../components/partners/PartnerStatCards.tsx';
import { SponsorshipScriptDialog } from '../components/partners/SponsorshipScriptDialog.tsx';
import { ProductDialog } from '../components/forms/ProductDialog.tsx';
import { SponsorshipDialog } from '../components/forms/SponsorshipDialog.tsx';
import { cn } from '../../shared/cn.ts';

/**
 * Une échéance dépassée sur quelque chose qui n'est pas arrivé se lit en rouge et ne
 * demande aucune interprétation. Une fois reçu ou payé, la date n'a plus rien d'urgent.
 */
const DeadlineCell = ({ date, pending }: { date: string | null; pending: boolean }) => {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const late = pending && date < toIsoDate(new Date());
  return (
    <span
      className={cn(
        'tabular',
        late ? 'font-medium text-[var(--negative)]' : 'text-muted-foreground',
      )}
    >
      {formatDate(date)}
    </span>
  );
};

export const PartnersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('onglet');
  const tab =
    requestedTab === 'sponsors' || requestedTab === 'plateformes' ? requestedTab : 'produits';

  const { data: products = [] } = useProducts();
  const { data: sponsorships = [] } = useSponsorships();
  const removeProduct = useDeleteProduct();
  const removeSponsorship = useDeleteSponsorship();

  const [productOpen, setProductOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [sponsorshipOpen, setSponsorshipOpen] = useState(false);
  const [editingSponsorship, setEditingSponsorship] = useState<Sponsorship | null>(null);
  /**
   * Sponso dont on écrit le script : un écran à part, jamais la modale d'édition.
   * On garde l'identifiant et non la fiche : après enregistrement, la liste est
   * rechargée, et un instantané figé laisserait l'éditeur croire éternellement qu'il
   * reste du non-enregistré.
   */
  const [scriptingId, setScriptingId] = useState<string | null>(null);
  const scripting = sponsorships.find((item) => item.id === scriptingId) ?? null;

  // Les mêmes chiffres que le dashboard, calculés au même endroit : deux comptages
  // parallèles finiraient par annoncer deux montants à encaisser différents.
  const pipeline = useMemo(
    () => partnerPipeline(products, sponsorships, toIsoDate(new Date())),
    [products, sponsorships],
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Partenariats</h1>
        <p className="text-sm text-muted-foreground">
          Les produits reçus et les sponsos payées alimentent tes revenus automatiquement — pas de
          double saisie, et pas de double comptage.
        </p>
      </div>

      <PartnerStatCards pipeline={pipeline} />

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ onglet: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="produits">Produits ({products.length})</TabsTrigger>
          <TabsTrigger value="sponsors">Sponsors ({sponsorships.length})</TabsTrigger>
          {/* Les plateformes ne sont pas un partenariat de plus : c'est l'endroit où se
              gère l'affiliation, et ce qu'elle rapporte. D'où un onglet à part. */}
          <TabsTrigger value="plateformes">Plateformes</TabsTrigger>
        </TabsList>

        <TabsContent value="produits">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <span className="text-muted-foreground">Valeur reçue : </span>
              <span className="tabular font-semibold text-[var(--in-kind)]">
                {formatMoney(pipeline.productsReceivedCents)}
              </span>
            </p>
            <Button
              size="sm"
              onClick={() => {
                setEditingProduct(null);
                setProductOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Ajouter un produit
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{products.length} produit(s)</CardTitle>
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
                {products.map((product) => (
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
                    {/* Une vidéo en préparation mène à sa fiche ; une sortie déjà
                        publiée n'en a pas, elle se lit telle quelle. */}
                    <TableCell className="max-w-[12rem] text-muted-foreground">
                      {product.productionId ? (
                        <Link
                          to={`/production/${product.productionId}`}
                          className="line-clamp-1 hover:underline"
                        >
                          {product.productionTitle}
                        </Link>
                      ) : product.videoTitle ? (
                        <span className="line-clamp-1" title={product.videoTitle}>
                          {product.videoTitle}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular font-medium text-[var(--in-kind)]">
                      {formatMoney(product.valueCents)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingProduct(product);
                            setProductOpen(true);
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
                              removeProduct.mutate(product.id);
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
        </TabsContent>

        <TabsContent value="sponsors">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <span className="text-muted-foreground">Encaissé : </span>
              <span className="tabular font-semibold text-[var(--positive)]">
                {formatMoney(pipeline.sponsorshipsPaidCents)}
              </span>
              <span className="ml-3 text-muted-foreground">À encaisser : </span>
              <span className="tabular font-semibold">
                {formatMoney(pipeline.sponsorshipsPendingCents)}
              </span>
            </p>
            <Button
              size="sm"
              onClick={() => {
                setEditingSponsorship(null);
                setSponsorshipOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              Ajouter une sponso
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{sponsorships.length} sponso(s)</CardTitle>
            </CardHeader>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Libellé</TableHead>
                  <TableHead>Marque</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Payée le</TableHead>
                  <TableHead>Vidéo</TableHead>
                  <TableHead className="text-right">Montant</TableHead>
                  <TableHead className="w-28" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sponsorships.map((sponsorship) => (
                  <TableRow key={sponsorship.id}>
                    <TableCell className="font-medium">
                      {sponsorship.label}
                      {sponsorship.productsCount > 0 && (
                        <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                          <Gift className="h-3 w-3" aria-hidden />
                          {sponsorship.productsCount} produit(s)
                          {sponsorship.productsValueCents > 0 &&
                            ` · ${formatMoney(sponsorship.productsValueCents)} reçus`}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {sponsorship.brandName ? (
                        <span className="flex items-center gap-2 text-sm">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: sponsorship.brandColor ?? '#94a3b8' }}
                            aria-hidden
                          />
                          {sponsorship.brandName}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={sponsorship.status === 'paid' ? 'positive' : 'secondary'}>
                        {SPONSORSHIP_STATUS_LABELS[sponsorship.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DeadlineCell
                        date={sponsorship.deadline}
                        pending={PENDING_SPONSORSHIP_STATUSES.includes(sponsorship.status)}
                      />
                    </TableCell>
                    <TableCell className="tabular text-muted-foreground">
                      {sponsorship.paidAt ? formatDate(sponsorship.paidAt) : '—'}
                    </TableCell>
                    <TableCell className="max-w-[12rem] text-muted-foreground">
                      {sponsorship.productionId ? (
                        <Link
                          to={`/production/${sponsorship.productionId}`}
                          className="line-clamp-1 hover:underline"
                        >
                          {sponsorship.productionTitle}
                        </Link>
                      ) : sponsorship.videoTitle ? (
                        <span className="line-clamp-1" title={sponsorship.videoTitle}>
                          {sponsorship.videoTitle}
                        </span>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular font-medium',
                        sponsorship.status === 'paid'
                          ? 'text-[var(--positive)]'
                          : 'text-muted-foreground',
                      )}
                    >
                      {formatMoney(sponsorship.amountCents)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        {/* Le script a son propre bouton, et pas une case de la modale :
                            on l'écrit en plusieurs passages, et un formulaire refermé
                            par mégarde emporterait le texte. La pastille dit qu'il y a
                            déjà quelque chose d'écrit. */}
                        <Button
                          variant="ghost"
                          size="icon"
                          title={
                            sponsorship.script.trim() === ''
                              ? "Écrire le script de l'intégration"
                              : 'Ouvrir le script'
                          }
                          onClick={() => setScriptingId(sponsorship.id)}
                        >
                          <FileText
                            className={cn(
                              'h-3.5 w-3.5',
                              sponsorship.script.trim() !== '' && 'text-[var(--positive)]',
                            )}
                          />
                          <span className="sr-only">Script de « {sponsorship.label} »</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setEditingSponsorship(sponsorship);
                            setSponsorshipOpen(true);
                          }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          <span className="sr-only">Modifier</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            if (window.confirm(`Supprimer « ${sponsorship.label} » ?`)) {
                              removeSponsorship.mutate(sponsorship.id);
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
        </TabsContent>

        <TabsContent value="plateformes">
          <PlatformsPanel />
        </TabsContent>
      </Tabs>

      <ProductDialog open={productOpen} onOpenChange={setProductOpen} product={editingProduct} />
      <SponsorshipDialog
        open={sponsorshipOpen}
        onOpenChange={setSponsorshipOpen}
        sponsorship={editingSponsorship}
      />
      <SponsorshipScriptDialog
        sponsorship={scripting}
        onOpenChange={(open) => {
          if (!open) setScriptingId(null);
        }}
      />
    </div>
  );
};
