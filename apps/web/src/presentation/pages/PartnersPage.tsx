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
import {
  partnerPipeline,
  productInPeriod,
  sponsorshipInPeriod,
} from '../../domain/partner/services/pipeline.ts';
import type { ProductionStatus } from '../../domain/production/entities/Production.ts';
import {
  STATUS_COLORS as PRODUCTION_STATUS_COLORS,
  STATUS_LABELS as PRODUCTION_STATUS_LABELS,
} from '../../domain/production/entities/Production.ts';
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
import { usePlatforms } from '../../application/affiliate/usecases/usePlatforms.ts';
import { useFilters } from '../hooks/useFilters.tsx';
import { PartnerStatCards } from '../components/partners/PartnerStatCards.tsx';
import { PeriodPicker } from '../components/filters/PeriodPicker.tsx';
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

/**
 * L'état de la vidéo à laquelle un produit ou une sponso est rattaché.
 *
 * C'est la question qu'on se pose devant la table des produits : **lesquels n'ont pas
 * encore de vidéo ?** Le titre seul ne le disait pas — une fiche à l'état d'idée et une
 * sortie déjà en ligne s'y lisaient exactement pareil.
 *
 * Trois cas, et le troisième est le seul qui appelle une action : une production en
 * cours (statut affiché dans sa couleur), une sortie **publiée** (elle est en ligne, il
 * n'y a plus rien à faire), ou **rien** — et c'est celui-là qu'on met en accent.
 */
const LinkedVideoCell = ({
  productionId,
  productionTitle,
  productionStatus,
  videoTitle,
}: {
  productionId: string | null;
  productionTitle: string | null;
  productionStatus: ProductionStatus | null;
  videoTitle: string | null;
}) => {
  if (productionId) {
    return (
      <div className="min-w-0">
        <Link to={`/production/${productionId}`} className="line-clamp-1 hover:underline">
          {productionTitle}
        </Link>
        {productionStatus && (
          <span className="text-xs" style={{ color: PRODUCTION_STATUS_COLORS[productionStatus] }}>
            {PRODUCTION_STATUS_LABELS[productionStatus]}
          </span>
        )}
      </div>
    );
  }

  if (videoTitle) {
    return (
      <div className="min-w-0">
        <span className="line-clamp-1" title={videoTitle}>
          {videoTitle}
        </span>
        <span className="text-xs" style={{ color: PRODUCTION_STATUS_COLORS.done }}>
          Publiée
        </span>
      </div>
    );
  }

  return <span className="text-xs font-medium text-[var(--expense)]">Aucune vidéo</span>;
};

export const PartnersPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('onglet');
  const tab =
    requestedTab === 'sponsors' || requestedTab === 'plateformes' ? requestedTab : 'produits';

  const { data: products = [] } = useProducts();
  // Mêmes paramètres que `PlatformsPanel` : la requête est partagée, pas dupliquée.
  // Le compteur de l'onglet exclut les archivées, comme les deux autres onglets.
  const filters = useFilters();
  const { data: platforms = [] } = usePlatforms({
    includeArchived: true,
    from: filters.from,
    to: filters.to,
  });
  const activePlatforms = platforms.filter((platform) => !platform.isArchived).length;
  const { data: sponsorships = [] } = useSponsorships();
  const removeProduct = useDeleteProduct();
  const removeSponsorship = useDeleteSponsorship();

  const range = useMemo(() => ({ from: filters.from, to: filters.to }), [filters.from, filters.to]);

  /**
   * Les deux listes, bornées par la période — mais **filtrées ici, pas dans l'API**.
   *
   * `/api/products` et `/api/sponsorships` alimentent aussi les sélecteurs de rattachement
   * (`AttachExistingSelect`, `ProductLinkField`, la modale d'une fiche de production) : les
   * borner là-bas masquerait silencieusement les fiches qu'on y cherche justement. La
   * requête reste donc entière, partagée et mise en cache, et c'est l'écran qui choisit ce
   * qu'il montre.
   *
   * Le prédicat est celui du pipeline et non un second : le total annoncé au-dessus de
   * chaque table retombe ainsi toujours sur les lignes affichées en dessous.
   */
  const visibleProducts = useMemo(
    () => products.filter((product) => productInPeriod(product, range)),
    [products, range],
  );
  const visibleSponsorships = useMemo(
    () => sponsorships.filter((sponsorship) => sponsorshipInPeriod(sponsorship, range)),
    [sponsorships, range],
  );

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
    () => partnerPipeline(products, sponsorships, toIsoDate(new Date()), range),
    [products, sponsorships, range],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Partenariats</h1>
          <p className="text-sm text-muted-foreground">
            Les produits reçus et les sponsos payées alimentent tes revenus automatiquement — pas de
            double saisie, et pas de double comptage.
          </p>
        </div>

        {/* L'écran n'a pas la barre de filtres (`ROUTES_WITHOUT_FILTERS`), mais deux de
            ses chiffres suivent bel et bien la période : « Total affiliations » et les
            gains par plateforme. Sans sélecteur, ils affichaient une période qu'on ne
            pouvait ni lire ni changer. La période est celle de tout l'outil — la régler
            ici la règle partout. Le reste de la barre (chaînes, pas, CA/bénéfice) ne
            pilote rien ici et resterait décoratif. */}
        <PeriodPicker />
      </div>

      <PartnerStatCards pipeline={pipeline} />

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams({ onglet: value }, { replace: true })}
      >
        <TabsList>
          <TabsTrigger value="produits">Produits ({visibleProducts.length})</TabsTrigger>
          <TabsTrigger value="sponsors">Sponsors ({visibleSponsorships.length})</TabsTrigger>
          {/* Les plateformes ne sont pas un partenariat de plus : c'est l'endroit où se
              gère l'affiliation, et ce qu'elle rapporte. D'où un onglet à part. */}
          <TabsTrigger value="plateformes">Plateformes ({activePlatforms})</TabsTrigger>
        </TabsList>

        <TabsContent value="produits">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            {/* Un flux : ce qui est arrivé PENDANT la période, comme le CA. Les
                produits encore attendus, eux, restent listés quelle que soit la
                période — ce sont des états, et les masquer ferait perdre de vue ce
                sur quoi il reste à agir. */}
            <p className="text-sm">
              <span className="text-muted-foreground">Valeur reçue sur la période : </span>
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
              <CardTitle>{visibleProducts.length} produit(s)</CardTitle>
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
                {visibleProducts.map((product) => (
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
                    {/* Une vidéo en préparation mène à sa fiche et affiche son état ;
                        une sortie déjà publiée se lit telle quelle. « Aucune vidéo » est
                        le seul cas qui demande quelque chose, et il est en accent. */}
                    <TableCell className="max-w-[12rem] text-muted-foreground">
                      <LinkedVideoCell
                        productionId={product.productionId}
                        productionTitle={product.productionTitle}
                        productionStatus={product.productionStatus}
                        videoTitle={product.videoTitle}
                      />
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
            {/* Les deux montants ne se lisent pas dans le même temps : l'encaissé
                est un flux borné par la période, le reste à encaisser un état qui
                l'ignore. Le dire évite d'y chercher une soustraction. */}
            <p className="text-sm">
              <span className="text-muted-foreground">Encaissé sur la période : </span>
              <span className="tabular font-semibold text-[var(--positive)]">
                {formatMoney(pipeline.sponsorshipsPaidCents)}
              </span>
              <span className="ml-3 text-muted-foreground">À encaisser (toutes périodes) : </span>
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
              <CardTitle>{visibleSponsorships.length} sponso(s)</CardTitle>
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
                {visibleSponsorships.map((sponsorship) => (
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
                      {/* `productionStatus` à `null` : la sponso ne porte pas l'état de sa
                          production, et le lien vers la fiche suffit — ce sont les produits
                          qu'on balaie du regard pour trouver ce qui n'a pas de vidéo. */}
                      <LinkedVideoCell
                        productionId={sponsorship.productionId}
                        productionTitle={sponsorship.productionTitle}
                        productionStatus={null}
                        videoTitle={sponsorship.videoTitle}
                      />
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
