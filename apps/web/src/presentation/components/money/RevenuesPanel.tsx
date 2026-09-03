import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CalendarClock, Lock, PackagePlus, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  useDeleteRevenue,
  useRevenues,
} from '../../../application/revenue/usecases/useRevenues.ts';
import { useUpcomingRevenues } from '../../../application/expense/usecases/useUpcoming.ts';
import { useFilters } from '../../hooks/useFilters.tsx';
import type { RevenueEntry } from '../../../domain/revenue/entities/Revenue.ts';
import { ORIGIN_LABELS, ORIGIN_TARGET } from '../../../domain/revenue/entities/Revenue.ts';
import {
  AFFILIATE_CATEGORY_ID,
  NATURE_LABELS,
} from '../../../domain/category/entities/Category.ts';
import { usePlatforms } from '../../../application/affiliate/usecases/usePlatforms.ts';
import { formatDate, formatMoney } from '../../../shared/format.ts';
import { Button } from '../ui/button.tsx';
import { Badge } from '../ui/badge.tsx';
import { Card, CardHeader, CardTitle } from '../ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { RevenueDialog } from '../forms/RevenueDialog.tsx';
import { ProductDialog } from '../forms/ProductDialog.tsx';
import { EmptyState } from '../EmptyState.tsx';
import { UPCOMING_MONTHS } from '../../../domain/expense/services/upcoming.ts';
import { Checkbox } from '../ui/checkbox.tsx';
import { Label } from '../ui/label.tsx';
import { cn } from '../../../shared/cn.ts';

/**
 * Un revenu d'affiliation sans plateforme rattachée.
 *
 * C'est la seule absence qui vaille d'être signalée : AdSense, une sponso ou un produit
 * reçu n'ont aucune raison d'avoir une plateforme, et les marquer tous ferait une colonne
 * d'avertissements qu'on cesserait de lire au bout de trois lignes.
 */
const needsPlatform = (entry: RevenueEntry): boolean =>
  entry.categoryId === AFFILIATE_CATEGORY_ID && entry.platformId === null;

interface RevenueTableProps {
  entries: RevenueEntry[];
  /** Lignes déjà datées en avant : grisées, en tête, et hors des totaux. */
  upcoming?: RevenueEntry[];
  onEdit: (entry: RevenueEntry) => void;
  onDelete: (entry: RevenueEntry) => void;
  onDocument: (entry: RevenueEntry) => void;
  /**
   * Affiche la colonne « Plateforme ». Masquée tant qu'aucune plateforme n'existe : ce
   * serait une colonne de tirets, et il n'y aurait de toute façon rien à y renseigner.
   */
  showPlatform: boolean;
}

/**
 * Le tableau des revenus, partagé par la période et par le bloc « à venir ».
 * Une seule définition : deux tableaux qui divergeraient d'une colonne rendraient la
 * comparaison entre ce qui est encaissé et ce qui arrive plus difficile qu'elle ne doit
 * l'être.
 */
const RevenueTable = ({
  entries,
  upcoming = [],
  onEdit,
  onDelete,
  onDocument,
  showPlatform,
}: RevenueTableProps) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Date</TableHead>
        <TableHead>Libellé</TableHead>
        <TableHead>Catégorie</TableHead>
        {showPlatform && <TableHead>Plateforme</TableHead>}
        <TableHead>Chaîne</TableHead>
        <TableHead>Vidéo</TableHead>
        <TableHead className="text-right">Montant</TableHead>
        <TableHead className="w-20" />
      </TableRow>
    </TableHeader>
    <TableBody>
      {[
        ...upcoming.map((entry) => ({ entry, isUpcoming: true })),
        ...entries.map((entry) => ({ entry, isUpcoming: false })),
      ].map(({ entry, isUpcoming }) => (
        <TableRow key={entry.id} className={cn(isUpcoming && 'bg-muted/30 text-muted-foreground')}>
          <TableCell className="whitespace-nowrap text-muted-foreground tabular">
            <span className="flex items-center gap-1.5">
              {isUpcoming && <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />}
              {formatDate(entry.date)}
            </span>
          </TableCell>
          <TableCell className="font-medium">
            {entry.label}
            {/* Une entrée générée dit d'où elle vient et où la corriger : sans ça,
                le bouton grisé serait vécu comme une panne. */}
            {entry.origin !== 'manual' && (
              <Link
                to={ORIGIN_TARGET[entry.origin]}
                className="ml-2 inline-flex items-center gap-1 align-middle text-xs font-normal text-muted-foreground hover:text-foreground hover:underline"
                title="Cette entrée est générée : elle se modifie depuis sa fiche."
              >
                <Lock className="h-3 w-3" aria-hidden />
                {ORIGIN_LABELS[entry.origin]}
              </Link>
            )}
            {entry.notes && (
              <span className="block text-xs font-normal text-muted-foreground">{entry.notes}</span>
            )}
          </TableCell>
          <TableCell>
            <span className="flex items-center gap-2">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: entry.categoryColor }}
                aria-hidden
              />
              {entry.categoryName}
              {entry.categoryNature === 'in_kind' && (
                <Badge variant="inKind">{NATURE_LABELS.in_kind}</Badge>
              )}
            </span>
          </TableCell>
          {showPlatform && (
            <TableCell>
              {entry.platformName ? (
                <span className="text-sm">{entry.platformName}</span>
              ) : needsPlatform(entry) ? (
                // Repérable d'un coup d'œil en parcourant la colonne, sans avoir à
                // croiser mentalement la catégorie et la case vide.
                <span
                  className="flex items-center gap-1 text-xs font-medium text-[var(--expense)]"
                  title="Revenu d'affiliation sans plateforme : modifie-le pour la renseigner."
                >
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />À renseigner
                </span>
              ) : (
                <span className="text-muted-foreground">—</span>
              )}
            </TableCell>
          )}
          <TableCell className="text-muted-foreground">{entry.channelName ?? 'Global'}</TableCell>
          <TableCell className="max-w-[14rem] text-muted-foreground">
            <span className="line-clamp-1" title={entry.videoTitle ?? undefined}>
              {entry.videoTitle ?? '—'}
            </span>
          </TableCell>
          <TableCell
            className={cn(
              'text-right tabular font-medium',
              isUpcoming && 'font-normal text-muted-foreground',
            )}
          >
            {formatMoney(entry.amountCents)}
          </TableCell>
          <TableCell>
            <div className="flex justify-end gap-1">
              {/* Un produit reçu saisi à la main n'a pas de fiche : marque,
                  échéance, sponso associée, tout est perdu. Le + ouvre le
                  formulaire produit pré-rempli pour le documenter enfin. */}
              {entry.origin === 'manual' && entry.categoryNature === 'in_kind' && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Créer la fiche produit correspondante"
                  onClick={() => onDocument(entry)}
                >
                  <PackagePlus className="h-3.5 w-3.5" />
                  <span className="sr-only">Documenter « {entry.label} »</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                disabled={entry.origin !== 'manual'}
                title={
                  entry.origin === 'manual'
                    ? 'Modifier'
                    : 'Généré automatiquement : modifie-le depuis sa fiche.'
                }
                onClick={() => onEdit(entry)}
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="sr-only">Modifier</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                disabled={entry.origin !== 'manual'}
                onClick={() => onDelete(entry)}
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
);

export const RevenuesPanel = () => {
  const filters = useFilters();
  const { data: entries = [], isLoading } = useRevenues({
    from: filters.from,
    to: filters.to,
    channelIds: filters.channelIds,
  });
  const upcoming = useUpcomingRevenues(filters.channelIds);
  // Sans plateforme configurée, la colonne n'aurait rien à montrer et rien à réclamer.
  const { data: platforms = [] } = usePlatforms();
  const remove = useDeleteRevenue();

  const [showUpcoming, setShowUpcoming] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RevenueEntry | null>(null);
  /** Revenu en nature en cours de documentation : il devient une fiche produit. */
  const [documenting, setDocumenting] = useState<RevenueEntry | null>(null);

  const totals = useMemo(() => {
    const cash = entries
      .filter((entry) => entry.categoryNature === 'cash')
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    const inKind = entries
      .filter((entry) => entry.categoryNature === 'in_kind')
      .reduce((sum, entry) => sum + entry.amountCents, 0);
    return { cash, inKind };
  }, [entries]);

  // Les plus lointains en haut : le tableau se lit du futur vers le passé, comme les
  // revenus de la période qui le suivent (date décroissante).
  const upcomingRows = useMemo(
    () => [...upcoming.revenues].sort((a, b) => b.date.localeCompare(a.date)),
    [upcoming.revenues],
  );
  // Mémorisé, et pas seulement dérivé : le compteur ci-dessous en dépend, et un tableau
  // recréé à chaque rendu le ferait recalculer en permanence.
  const visibleUpcoming = useMemo(
    () => (showUpcoming ? upcomingRows : []),
    [showUpcoming, upcomingRows],
  );

  const showPlatform = platforms.length > 0;
  /** Ce qu'il reste à rattacher, sur la période comme dans ce qui arrive. */
  const missingPlatform = useMemo(
    () => [...entries, ...visibleUpcoming].filter(needsPlatform).length,
    [entries, visibleUpcoming],
  );

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEdit = (entry: RevenueEntry) => {
    setEditing(entry);
    setDialogOpen(true);
  };

  const confirmDelete = (entry: RevenueEntry) => {
    if (window.confirm(`Supprimer « ${entry.label} » ?`)) remove.mutate(entry.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-4 text-sm">
          <span>
            <span className="text-muted-foreground">Encaissé : </span>
            <span className="tabular font-semibold">{formatMoney(totals.cash)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">{NATURE_LABELS.in_kind} : </span>
            <span className="tabular font-semibold text-[var(--in-kind)]">
              {formatMoney(totals.inKind)}
            </span>
          </span>
          <span className="text-xs text-muted-foreground">
            AdSense non listé ici : collecté automatiquement
          </span>
          {showPlatform && missingPlatform > 0 && (
            <span
              className="flex items-center gap-1 text-xs font-medium text-[var(--expense)]"
              title="Ces revenus d'affiliation n'ont pas de plateforme rattachée : leurs montants ne comptent dans aucun classement de plateforme."
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {missingPlatform} sans plateforme
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {upcomingRows.length > 0 && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-upcoming-revenues"
                checked={showUpcoming}
                onCheckedChange={(checked) => setShowUpcoming(checked === true)}
              />
              <Label
                htmlFor="show-upcoming-revenues"
                className="text-xs font-normal text-muted-foreground"
              >
                Afficher les {upcomingRows.length} revenu(s) à venir (
                {formatMoney(upcoming.totalCents)})
              </Label>
            </div>
          )}
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Ajouter un revenu
          </Button>
        </div>
      </div>

      {!isLoading && entries.length === 0 && upcomingRows.length === 0 ? (
        <EmptyState
          title="Aucun revenu sur cette période"
          description="Ajoute tes sponsos, revenus d'affiliation ou produits reçus pour les voir apparaître dans le dashboard."
          actionLabel="Ajouter un revenu"
          onAction={openCreate}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{entries.length} revenu(s)</CardTitle>
            {visibleUpcoming.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Les {visibleUpcoming.length} première(s) ligne(s), grisées, sont à venir d'ici{' '}
                {UPCOMING_MONTHS} mois : déjà enregistrées, pas encore arrivées, et hors des totaux
                ci-dessus.
              </p>
            )}
          </CardHeader>
          {/* Une colonne de plus peut déborder sur un écran étroit : le tableau défile
              dans son propre conteneur plutôt que d'emporter la page en travers. */}
          <div className="overflow-x-auto">
            <RevenueTable
              entries={entries}
              upcoming={visibleUpcoming}
              onEdit={openEdit}
              onDelete={confirmDelete}
              onDocument={setDocumenting}
              showPlatform={showPlatform}
            />
          </div>
        </Card>
      )}

      <RevenueDialog open={dialogOpen} onOpenChange={setDialogOpen} entry={editing} />

      {/* La fiche produit régénère un revenu équivalent (`origin: 'product'`) : l'entrée
          manuelle d'origine est supprimée juste après, sinon le même euro compterait
          deux fois. Créer d'abord, supprimer ensuite — l'inverse perdrait la saisie si
          la création échouait. */}
      <ProductDialog
        open={documenting !== null}
        onOpenChange={(next) => {
          if (!next) setDocumenting(null);
        }}
        defaults={
          documenting
            ? {
                name: documenting.label,
                value: documenting.amountCents / 100,
                receivedAt: documenting.date,
                channelId: documenting.channelId,
                videoId: documenting.videoId,
              }
            : undefined
        }
        onCreated={() => {
          if (documenting) remove.mutate(documenting.id);
          setDocumenting(null);
        }}
      />
    </div>
  );
};
