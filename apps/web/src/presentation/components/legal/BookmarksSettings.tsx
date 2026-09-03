import { useState } from 'react';
import { ChevronDown, ChevronUp, ExternalLink, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import {
  useCreateBookmark,
  useDeleteBookmark,
  useLegalBookmarks,
  useUpdateBookmark,
} from '../../../application/legal/usecases/useLegal.ts';
import type { LegalBookmark } from '../../../domain/legal/entities/Legal.ts';
import { faviconOf, hostOf } from '../../../domain/legal/entities/Legal.ts';
import { Button } from '../ui/button.tsx';
import { Card, CardHeader, CardTitle } from '../ui/card.tsx';
import { Input, Textarea } from '../ui/input.tsx';
import { Label } from '../ui/label.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';

const EMPTY = { label: '', url: '', description: '', imageUrl: '', color: '#64748b' };

/**
 * Le référentiel des liens utiles de l'écran Légal.
 *
 * Rangé ici plutôt que sur `/legal` : c'est de la configuration, on l'ouvre une fois par
 * an. L'écran Légal ne porte que les cartes, cliquables, et un discret « Gérer » qui
 * mène ici.
 *
 * L'ordre est **manuel**, comme celui des obligations et de la file de production :
 * l'outil ne déduit aucune priorité entre le portail Urssaf et celui des impôts.
 */
export const BookmarksSettings = () => {
  const { data: bookmarks = [] } = useLegalBookmarks(true);
  const create = useCreateBookmark();
  const update = useUpdateBookmark();
  const remove = useDeleteBookmark();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LegalBookmark | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (bookmark: LegalBookmark) => {
    setEditing(bookmark);
    setForm({
      label: bookmark.label,
      url: bookmark.url,
      description: bookmark.description ?? '',
      imageUrl: bookmark.imageUrl ?? '',
      color: bookmark.color,
    });
    setError(null);
    setDialogOpen(true);
  };

  /** Échange les rangs de deux favoris : le tri est manuel, comme celui des obligations. */
  const swap = (index: number, direction: -1 | 1) => {
    const current = bookmarks[index];
    const other = bookmarks[index + direction];
    if (!current || !other) return;
    update.mutate({ id: current.id, input: { sortOrder: other.sortOrder } });
    update.mutate({ id: other.id, input: { sortOrder: current.sortOrder } });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const payload = {
      label: form.label.trim(),
      // Une adresse sans protocole est le cas le plus fréquent quand on la recopie
      // depuis une barre d'adresse : on complète plutôt que de refuser.
      url: /^https?:\/\//i.test(form.url.trim()) ? form.url.trim() : `https://${form.url.trim()}`,
      description: form.description.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      color: form.color,
    };

    try {
      if (editing) await update.mutateAsync({ id: editing.id, input: payload });
      else await create.mutateAsync(payload);
      setDialogOpen(false);
    } catch (mutationError) {
      setError(
        mutationError instanceof Error ? mutationError.message : 'Enregistrement impossible',
      );
    }
  };

  const pending = create.isPending || update.isPending;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold">
            <Star className="h-4 w-4" />
            Liens utiles
          </h2>
          <p className="text-sm text-muted-foreground">
            Affichés sur l'écran Légal, entre la fiche de la société et le tableau à cocher. L'ordre
            ci-dessous est celui des cartes.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Nouveau lien
        </Button>
      </div>

      {bookmarks.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Aucun lien. Ajoute le portail Urssaf, celui des impôts, ta banque — ce que tu rouvres
          chaque mois pour faire tes démarches.
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{bookmarks.length} lien(s)</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Adresse</TableHead>
                <TableHead className="w-36" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {bookmarks.map((bookmark, index) => (
                <TableRow key={bookmark.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {/* La même vignette que sur les cartes, en petit : on vérifie ici
                          que l'image choisie tombe bien. */}
                      <img
                        src={bookmark.imageUrl ?? faviconOf(bookmark.url) ?? ''}
                        alt=""
                        className="h-5 w-5 shrink-0 rounded object-contain"
                        onError={(event) => {
                          event.currentTarget.style.visibility = 'hidden';
                        }}
                      />
                      {bookmark.label}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[20rem] text-muted-foreground">
                    <span className="line-clamp-1">{bookmark.description ?? '—'}</span>
                  </TableCell>
                  <TableCell>
                    <a
                      href={bookmark.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {hostOf(bookmark.url)}
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </a>
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
                        disabled={index === bookmarks.length - 1}
                        onClick={() => swap(index, 1)}
                        title="Descendre"
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                        <span className="sr-only">Descendre</span>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(bookmark)}>
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Modifier</span>
                      </Button>
                      {/* Pas d'archivage ici, contrairement aux obligations : un lien ne
                          porte aucun historique, il n'y a rien à préserver. */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (window.confirm(`Supprimer « ${bookmark.label} » ?`)) {
                            remove.mutate(bookmark.id);
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
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier le lien' : 'Nouveau lien'}</DialogTitle>
            <DialogDescription>
              Il apparaîtra en carte cliquable sur l'écran Légal, au-dessus du tableau à cocher.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <div className="space-y-1.5">
                <Label htmlFor="bookmark-label">Nom</Label>
                <Input
                  id="bookmark-label"
                  placeholder="Urssaf, impôts, banque…"
                  value={form.label}
                  onChange={(event) => setForm((f) => ({ ...f, label: event.target.value }))}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bookmark-color">Couleur</Label>
                <Input
                  id="bookmark-color"
                  type="color"
                  className="h-9 w-20 p-1"
                  value={form.color}
                  onChange={(event) => setForm((f) => ({ ...f, color: event.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bookmark-url">Adresse</Label>
              <Input
                id="bookmark-url"
                placeholder="www.urssaf.fr"
                value={form.url}
                onChange={(event) => setForm((f) => ({ ...f, url: event.target.value }))}
                required
              />
              <p className="text-xs text-muted-foreground">
                Le « https:// » est ajouté tout seul s'il manque.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bookmark-description">Description</Label>
              <Textarea
                id="bookmark-description"
                placeholder="Déclaration trimestrielle du chiffre d'affaires"
                value={form.description}
                onChange={(event) => setForm((f) => ({ ...f, description: event.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="bookmark-image">Image</Label>
              <Input
                id="bookmark-image"
                placeholder="https://…/logo.png"
                value={form.imageUrl}
                onChange={(event) => setForm((f) => ({ ...f, imageUrl: event.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Facultatif. Sans image, le favicon du site est tenté ; à défaut, l'initiale du nom
                sur la couleur choisie.
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Annuler
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
