import { useState } from 'react';
import { Archive, ArchiveRestore, Plus, Trash2 } from 'lucide-react';
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
} from '../../application/category/usecases/useCategories.ts';
import type { CategoryNature, CategoryScope } from '../../domain/category/entities/Category.ts';
import {
  NATURE_HINTS,
  NATURE_LABELS,
  SCOPE_HINTS,
  SCOPE_LABELS,
  usesNature,
} from '../../domain/category/entities/Category.ts';
import { Button } from '../components/ui/button.tsx';
import { Badge } from '../components/ui/badge.tsx';
import { Card, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog.tsx';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table.tsx';
import { cn } from '../../shared/cn.ts';

export const CategoriesPage = () => {
  const { data: categories = [] } = useCategories({ includeArchived: true });
  const update = useUpdateCategory();
  const remove = useDeleteCategory();
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Catégories</h1>
          <p className="text-sm text-muted-foreground">
            Chaque catégorie sert aux revenus, aux dépenses, ou aux deux. La nature ne concerne que
            les revenus : elle dit si l'argent est encaissé ou reçu en nature.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouvelle catégorie
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{categories.length} catégorie(s)</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Utilisable pour</TableHead>
              <TableHead>Nature</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.map((category) => (
              <TableRow key={category.id} className={cn(category.isArchived && 'opacity-50')}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: category.color }}
                      aria-hidden
                    />
                    {category.name}
                    {category.isArchived && <Badge variant="outline">Archivée</Badge>}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{SCOPE_LABELS[category.scope]}</Badge>
                </TableCell>
                <TableCell>
                  {usesNature(category.scope) ? (
                    <Badge variant={category.nature === 'in_kind' ? 'inKind' : 'secondary'}>
                      {NATURE_LABELS[category.nature]}
                    </Badge>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {category.isAuto ? 'Collecte automatique' : 'Saisie manuelle'}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title={category.isArchived ? 'Réactiver' : 'Archiver'}
                      onClick={() =>
                        update.mutate({
                          id: category.id,
                          input: { isArchived: !category.isArchived },
                        })
                      }
                    >
                      {category.isArchived ? (
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      ) : (
                        <Archive className="h-3.5 w-3.5" />
                      )}
                    </Button>
                    {/* AdSense est protégé côté API : le bouton est masqué pour éviter un échec inutile. */}
                    {!category.isAuto && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (window.confirm(`Supprimer « ${category.name} » ?`)) {
                            remove.mutate(category.id, {
                              onError: (error) =>
                                window.alert(
                                  error instanceof Error ? error.message : 'Suppression impossible',
                                ),
                            });
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      <CategoryDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
};

const CategoryDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const create = useCreateCategory();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<CategoryScope>('revenue');
  const [nature, setNature] = useState<CategoryNature>('cash');
  const [color, setColor] = useState('#64748b');
  const [error, setError] = useState<string | null>(null);

  const natureApplies = usesNature(scope);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      // Une catégorie de dépense pure est forcément du cash : la nature n'a de sens
      // qu'à l'entrée, et l'API la garde renseignée en base.
      await create.mutateAsync({
        name: name.trim(),
        scope,
        nature: natureApplies ? nature : 'cash',
        color,
      });
      setName('');
      onOpenChange(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Création impossible');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouvelle catégorie</DialogTitle>
          <DialogDescription>
            {SCOPE_HINTS[scope]}
            {natureApplies && ` ${NATURE_HINTS[nature]}`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="category-name">Nom</Label>
            <Input
              id="category-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Formations, dons, hébergement…"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="category-scope">Utilisable pour</Label>
              <Select value={scope} onValueChange={(value) => setScope(value as CategoryScope)}>
                <SelectTrigger id="category-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="revenue">{SCOPE_LABELS.revenue}</SelectItem>
                  <SelectItem value="expense">{SCOPE_LABELS.expense}</SelectItem>
                  <SelectItem value="both">{SCOPE_LABELS.both}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="category-color">Couleur</Label>
              <Input
                id="category-color"
                type="color"
                className="h-9 w-20 p-1"
                value={color}
                onChange={(event) => setColor(event.target.value)}
              />
            </div>
          </div>

          {natureApplies && (
            <div className="space-y-1.5">
              <Label htmlFor="category-nature">Nature du revenu</Label>
              <Select value={nature} onValueChange={(value) => setNature(value as CategoryNature)}>
                <SelectTrigger id="category-nature">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{NATURE_LABELS.cash}</SelectItem>
                  <SelectItem value="in_kind">{NATURE_LABELS.in_kind}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Création…' : 'Créer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
