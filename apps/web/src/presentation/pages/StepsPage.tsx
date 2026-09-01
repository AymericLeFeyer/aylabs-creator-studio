import { useState } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  useCreateStep,
  useDeleteStep,
  useProductionSteps,
  useUpdateStep,
} from '../../application/production/usecases/useProductions.ts';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Input } from '../components/ui/input.tsx';
import { Label } from '../components/ui/label.tsx';
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

/**
 * Le référentiel des étapes d'une vidéo.
 *
 * L'ordre défini ici n'est qu'un **ordre d'affichage** : les cases se cochent dans le
 * sens qu'on veut. C'est justement pour ça que les étapes sont des lignes en base et
 * non des colonnes — en ajouter une ne demande aucune migration.
 */
export const StepsPage = () => {
  const { data: steps = [] } = useProductionSteps(true);
  const create = useCreateStep();
  const update = useUpdateStep();
  const remove = useDeleteStep();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: '', color: '#64748b' });
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({ name: form.name.trim(), color: form.color });
      setForm({ name: '', color: '#64748b' });
      setDialogOpen(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Création impossible');
    }
  };

  /** Échange les rangs de deux étapes : le tri est manuel, comme la file d'attente. */
  const swap = (index: number, direction: -1 | 1) => {
    const current = steps[index];
    const other = steps[index + direction];
    if (!current || !other) return;
    update.mutate({ id: current.id, input: { sortOrder: other.sortOrder } });
    update.mutate({ id: other.id, input: { sortOrder: current.sortOrder } });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Étapes</h1>
          <p className="text-sm text-muted-foreground">
            Les cases à cocher de chaque vidéo. L'ordre ci-dessous est celui de l'affichage : tu les
            coches dans le sens que tu veux.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouvelle étape
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{steps.length} étape(s)</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nom</TableHead>
              <TableHead>Couleur</TableHead>
              <TableHead className="w-40" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {steps.map((step, index) => (
              <TableRow key={step.id} className={cn(step.isArchived && 'opacity-50')}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: step.color }}
                      aria-hidden
                    />
                    {/* Champs non contrôlés, validés à la sortie : une mutation par
                        frappe partirait à chaque lettre du nom. */}
                    <Input
                      key={`${step.id}-name`}
                      defaultValue={step.name}
                      onBlur={(event) => {
                        const name = event.target.value.trim();
                        if (name && name !== step.name) {
                          update.mutate({ id: step.id, input: { name } });
                        }
                      }}
                      className="h-8 max-w-56"
                    />
                    {step.isArchived && <Badge variant="outline">Archivée</Badge>}
                  </span>
                </TableCell>
                <TableCell>
                  <Input
                    key={`${step.id}-color`}
                    type="color"
                    defaultValue={step.color}
                    onBlur={(event) => {
                      if (event.target.value !== step.color) {
                        update.mutate({ id: step.id, input: { color: event.target.value } });
                      }
                    }}
                    className="h-8 w-16 p-1"
                  />
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={index === 0}
                      onClick={() => swap(index, -1)}
                      title="Monter"
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                      <span className="sr-only">Monter</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={index === steps.length - 1}
                      onClick={() => swap(index, 1)}
                      title="Descendre"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                      <span className="sr-only">Descendre</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={step.isArchived ? 'Réactiver' : 'Archiver'}
                      onClick={() =>
                        update.mutate({ id: step.id, input: { isArchived: !step.isArchived } })
                      }
                    >
                      {step.isArchived ? (
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      ) : (
                        <Archive className="h-3.5 w-3.5" />
                      )}
                      <span className="sr-only">{step.isArchived ? 'Réactiver' : 'Archiver'}</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        // Supprimer efface la case sur toutes les vidéos qui l'avaient
                        // cochée : l'archivage la retire de la vue sans perdre l'historique.
                        if (
                          window.confirm(
                            `Supprimer « ${step.name} » ? Elle disparaîtra de toutes les vidéos.`,
                          )
                        ) {
                          remove.mutate(step.id);
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nouvelle étape</DialogTitle>
            <DialogDescription>
              Elle apparaîtra comme une case sur toutes les vidéos, y compris celles déjà en cours.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="step-name">Nom</Label>
                <Input
                  id="step-name"
                  placeholder="Sous-titres, SEO, vignette alternative…"
                  value={form.name}
                  onChange={(event) => setForm((f) => ({ ...f, name: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="step-color">Couleur</Label>
                <Input
                  id="step-color"
                  type="color"
                  className="h-9 w-20 p-1"
                  value={form.color}
                  onChange={(event) => setForm((f) => ({ ...f, color: event.target.value }))}
                />
              </div>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Création…' : 'Créer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
