import { useState } from 'react';
import { Archive, ArchiveRestore, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import {
  useCreateObligation,
  useDeleteObligation,
  useLegalObligations,
  useLegalOverview,
  useUpdateCompany,
  useUpdateObligation,
} from '../../application/legal/usecases/useLegal.ts';
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
import { BookmarksSettings } from '../components/legal/BookmarksSettings.tsx';
import { cn } from '../../shared/cn.ts';

/** Les champs texte de la société, dans l'ordre où on les recopie sur une facture. */
const FIELDS = [
  { key: 'name', label: 'Nom', placeholder: 'Aylabs' },
  { key: 'legalForm', label: 'Forme juridique', placeholder: 'SASU, micro-entreprise…' },
  { key: 'siret', label: 'SIRET', placeholder: '123 456 789 00012' },
  { key: 'vatNumber', label: 'N° TVA intracommunautaire', placeholder: 'FR12345678900' },
] as const;

/**
 * Les réglages du suivi administratif : la société, puis le référentiel des obligations.
 *
 * Les deux vivent sur le même écran parce qu'ils se règlent au même moment — le jour où
 * on installe l'outil — et parce que la **date de création** saisie ici décide du
 * premier mois du tableau légal : la séparer des obligations qu'elle dimensionne
 * obligerait à faire l'aller-retour.
 *
 * Comme `StepsPage`, les champs sont non contrôlés et validés à la sortie
 * (`defaultValue` + `onBlur`) : un `onChange` branché sur la mutation enverrait une
 * requête par lettre tapée.
 */
export const CompanyPage = () => {
  const { data: overview } = useLegalOverview();
  const { data: obligations = [] } = useLegalObligations(true);
  const updateCompany = useUpdateCompany();
  const create = useCreateObligation();
  const update = useUpdateObligation();
  const remove = useDeleteObligation();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ label: '', dayOfMonth: '' });
  const [error, setError] = useState<string | null>(null);

  const company = overview?.company;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      await create.mutateAsync({
        label: form.label.trim(),
        // Un jour vide n'est pas un zéro : c'est « pas d'échéance connue », et le mois
        // entier fait alors foi.
        dayOfMonth: form.dayOfMonth === '' ? null : Number(form.dayOfMonth),
      });
      setForm({ label: '', dayOfMonth: '' });
      setDialogOpen(false);
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : 'Création impossible');
    }
  };

  const swap = (index: number, direction: -1 | 1) => {
    const current = obligations[index];
    const other = obligations[index + direction];
    if (!current || !other) return;
    update.mutate({ id: current.id, input: { sortOrder: other.sortOrder } });
    update.mutate({ id: other.id, input: { sortOrder: current.sortOrder } });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold">Société &amp; obligations</h2>
        <p className="text-sm text-muted-foreground">
          Les informations de la société, et les démarches qui reviennent chaque mois. Chacune
          devient une case à cocher dans l'onglet Légal.
        </p>
      </div>

      <Card className="p-4">
        <CardTitle className="mb-3">Société</CardTitle>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {FIELDS.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`company-${field.key}`}>{field.label}</Label>
              <Input
                id={`company-${field.key}`}
                key={`${field.key}-${company?.updatedAt ?? ''}`}
                defaultValue={company?.[field.key] ?? ''}
                placeholder={field.placeholder}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value !== (company?.[field.key] ?? '')) {
                    updateCompany.mutate({ [field.key]: value });
                  }
                }}
              />
            </div>
          ))}

          {/* C'est elle qui décide du premier mois du tableau légal : sans elle, il
              retombe sur les douze derniers mois. */}
          <div className="space-y-1.5">
            <Label htmlFor="company-foundedOn">Date de création</Label>
            <Input
              id="company-foundedOn"
              key={`foundedOn-${company?.updatedAt ?? ''}`}
              type="date"
              defaultValue={company?.foundedOn ?? ''}
              onBlur={(event) => {
                const value = event.target.value;
                if (value !== (company?.foundedOn ?? '')) {
                  updateCompany.mutate({ foundedOn: value === '' ? null : value });
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Le tableau des obligations démarre à ce mois-là.
            </p>
          </div>

          <div className="space-y-1.5 sm:col-span-2 xl:col-span-1">
            <Label htmlFor="company-address">Adresse</Label>
            <Input
              id="company-address"
              key={`address-${company?.updatedAt ?? ''}`}
              defaultValue={company?.address ?? ''}
              placeholder="12 rue des Créateurs, 75000 Paris"
              onBlur={(event) => {
                const value = event.target.value.trim();
                if (value !== (company?.address ?? '')) {
                  updateCompany.mutate({ address: value });
                }
              }}
            />
          </div>
        </div>

        <div className="mt-4 space-y-1.5">
          <Label htmlFor="company-notes">Notes</Label>
          <textarea
            id="company-notes"
            key={`notes-${company?.updatedAt ?? ''}`}
            defaultValue={company?.notes ?? ''}
            rows={3}
            placeholder="Numéro de compte, cabinet comptable, échéances particulières…"
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            onBlur={(event) => {
              const value = event.target.value.trim();
              if (value !== (company?.notes ?? '')) {
                updateCompany.mutate({ notes: value });
              }
            }}
          />
        </div>
      </Card>

      {/* Rangés dans le même ordre que sur l'écran Légal — fiche, liens, cases : la
          page de configuration se lit comme l'écran qu'elle configure. */}
      <BookmarksSettings />

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Obligations mensuelles</h2>
          <p className="text-sm text-muted-foreground">
            L'ordre ci-dessous est celui des colonnes du tableau légal.
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Nouvelle obligation
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{obligations.length} obligation(s)</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Libellé</TableHead>
              <TableHead className="w-44">Date max dans le mois</TableHead>
              <TableHead className="w-44" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {obligations.map((obligation, index) => (
              <TableRow key={obligation.id} className={cn(obligation.isArchived && 'opacity-50')}>
                <TableCell className="font-medium">
                  <span className="flex items-center gap-2">
                    <Input
                      key={`${obligation.id}-label`}
                      defaultValue={obligation.label}
                      onBlur={(event) => {
                        const label = event.target.value.trim();
                        if (label && label !== obligation.label) {
                          update.mutate({ id: obligation.id, input: { label } });
                        }
                      }}
                      className="h-8 max-w-80"
                    />
                    {obligation.isArchived && <Badge variant="outline">Archivée</Badge>}
                  </span>
                </TableCell>

                <TableCell>
                  {/* Vide = pas d'échéance : rien n'est en retard tant que le mois n'est
                      pas terminé. Un 31 sur un mois de 30 jours est ramené au dernier jour. */}
                  <Input
                    key={`${obligation.id}-day`}
                    type="number"
                    min={1}
                    max={31}
                    placeholder="—"
                    defaultValue={obligation.dayOfMonth ?? ''}
                    onBlur={(event) => {
                      const raw = event.target.value.trim();
                      const next = raw === '' ? null : Math.min(Math.max(Number(raw), 1), 31);
                      if (next !== obligation.dayOfMonth) {
                        update.mutate({ id: obligation.id, input: { dayOfMonth: next } });
                      }
                    }}
                    className="h-8 w-24"
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
                      disabled={index === obligations.length - 1}
                      onClick={() => swap(index, 1)}
                      title="Descendre"
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                      <span className="sr-only">Descendre</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={obligation.isArchived ? 'Réactiver' : 'Archiver'}
                      onClick={() =>
                        update.mutate({
                          id: obligation.id,
                          input: { isArchived: !obligation.isArchived },
                        })
                      }
                    >
                      {obligation.isArchived ? (
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      ) : (
                        <Archive className="h-3.5 w-3.5" />
                      )}
                      <span className="sr-only">
                        {obligation.isArchived ? 'Réactiver' : 'Archiver'}
                      </span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        // Supprimer efface les cases cochées de tous les mois :
                        // l'archivage la retire du tableau sans perdre l'historique.
                        if (
                          window.confirm(
                            `Supprimer « ${obligation.label} » ? Les cases cochées de tous les mois seront perdues.`,
                          )
                        ) {
                          remove.mutate(obligation.id);
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
            <DialogTitle>Nouvelle obligation</DialogTitle>
            <DialogDescription>
              Elle apparaîtra comme une colonne du tableau légal, sur tous les mois depuis la
              création de la société.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="obligation-label">Libellé</Label>
                <Input
                  id="obligation-label"
                  placeholder="Déclaration de TVA, acompte IS…"
                  value={form.label}
                  onChange={(event) => setForm((f) => ({ ...f, label: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="obligation-day">Date max</Label>
                <Input
                  id="obligation-day"
                  type="number"
                  min={1}
                  max={31}
                  placeholder="—"
                  className="w-24"
                  value={form.dayOfMonth}
                  onChange={(event) => setForm((f) => ({ ...f, dayOfMonth: event.target.value }))}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground">
              Sans date max, c'est le mois entier qui fait foi : rien n'est en retard tant qu'il
              n'est pas terminé.
            </p>

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
