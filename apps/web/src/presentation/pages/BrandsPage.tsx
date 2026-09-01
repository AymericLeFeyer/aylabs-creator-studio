import { useState } from 'react';
import { Archive, ArchiveRestore, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  useBrands,
  useDeleteBrand,
  useUpdateBrand,
} from '../../application/brand/usecases/useBrands.ts';
import { useProducts } from '../../application/product/usecases/useProducts.ts';
import { useSponsorships } from '../../application/sponsorship/usecases/useSponsorships.ts';
import type { Brand } from '../../domain/brand/entities/Brand.ts';
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
import { EmptyState } from '../components/EmptyState.tsx';
import { BrandDialog } from '../components/forms/BrandDialog.tsx';
import { cn } from '../../shared/cn.ts';

export const BrandsPage = () => {
  const { data: brands = [] } = useBrands(true);
  const { data: products = [] } = useProducts();
  const { data: sponsorships = [] } = useSponsorships();
  const update = useUpdateBrand();
  const remove = useDeleteBrand();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Brand | null>(null);
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  // Compté côté client : les deux listes sont déjà chargées pour d'autres écrans, une
  // route d'agrégat de plus ne servirait qu'à ce tableau.
  const countFor = (brandId: string) => ({
    products: products.filter((product) => product.brandId === brandId).length,
    sponsorships: sponsorships.filter((sponsorship) => sponsorship.brandId === brandId).length,
  });

  if (brands.length === 0) {
    return (
      <>
        <EmptyState
          title="Aucune marque"
          description="Crée les marques avec qui tu travailles : les produits et les sponsos s'y rattachent, et le dashboard peut alors classer celles qui donnent et celles qui paient le plus."
          actionLabel="Nouvelle marque"
          onAction={openCreate}
        />
        <BrandDialog open={dialogOpen} onOpenChange={setDialogOpen} brand={editing} />
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Marques</h1>
          <p className="text-sm text-muted-foreground">
            Le référentiel commun aux produits et aux sponsos. Une marque encore utilisée s'archive,
            elle ne se supprime pas.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nouvelle marque
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle>{brands.length} marque(s)</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead className="text-right">Produits</TableHead>
              <TableHead className="text-right">Sponsos</TableHead>
              <TableHead className="w-28" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {brands.map((brand) => {
              const counts = countFor(brand.id);
              return (
                <TableRow key={brand.id} className={cn(brand.isArchived && 'opacity-50')}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: brand.color }}
                        aria-hidden
                      />
                      {brand.website ? (
                        <a
                          href={brand.website}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:underline"
                        >
                          {brand.name}
                        </a>
                      ) : (
                        brand.name
                      )}
                      {brand.isArchived && <Badge variant="outline">Archivée</Badge>}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {brand.contactName ?? '—'}
                    {brand.contactEmail && (
                      <a
                        href={`mailto:${brand.contactEmail}`}
                        className="block text-xs hover:underline"
                      >
                        {brand.contactEmail}
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular">{counts.products}</TableCell>
                  <TableCell className="text-right tabular">{counts.sponsorships}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditing(brand);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Modifier</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={brand.isArchived ? 'Réactiver' : 'Archiver'}
                        onClick={() =>
                          update.mutate({
                            id: brand.id,
                            input: { isArchived: !brand.isArchived },
                          })
                        }
                      >
                        {brand.isArchived ? (
                          <ArchiveRestore className="h-3.5 w-3.5" />
                        ) : (
                          <Archive className="h-3.5 w-3.5" />
                        )}
                        <span className="sr-only">
                          {brand.isArchived ? 'Réactiver' : 'Archiver'}
                        </span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setError(null);
                          if (!window.confirm(`Supprimer « ${brand.name} » ?`)) return;
                          remove.mutate(brand.id, {
                            // L'API refuse en 409 si des produits ou des sponsos s'y
                            // rattachent : le message dit combien, on l'affiche tel quel.
                            onError: (mutationError) =>
                              setError(
                                mutationError instanceof Error
                                  ? mutationError.message
                                  : 'Suppression impossible',
                              ),
                          });
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        <span className="sr-only">Supprimer</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>

      <BrandDialog open={dialogOpen} onOpenChange={setDialogOpen} brand={editing} />
    </div>
  );
};
