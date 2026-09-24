import { useMemo, useState } from 'react';
import { FileText, Gift, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  useDeleteSponsorship,
  useSponsorships,
} from '../../../application/sponsorship/usecases/useSponsorships.ts';
import type { Sponsorship } from '../../../domain/sponsorship/entities/Sponsorship.ts';
import {
  PENDING_SPONSORSHIP_STATUSES,
  SPONSORSHIP_STATUS_BADGES,
  SPONSORSHIP_STATUS_LABELS,
} from '../../../domain/sponsorship/entities/Sponsorship.ts';
import {
  partnerPipeline,
  sponsorshipInPeriod,
  sponsorshipIsOutstanding,
} from '../../../domain/partner/services/pipeline.ts';
import { formatDate, toIsoDate } from '../../../shared/format.ts';
import { cn } from '../../../shared/cn.ts';
import { usePrivacy } from '../../hooks/usePrivacy.tsx';
import { useFilters } from '../../hooks/useFilters.tsx';
import { Badge } from '../ui/badge.tsx';
import { Button } from '../ui/button.tsx';
import { Card, CardHeader, CardTitle } from '../ui/card.tsx';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table.tsx';
import { SponsorshipDialog } from '../forms/SponsorshipDialog.tsx';
import { SponsorshipScriptDialog } from './SponsorshipScriptDialog.tsx';
import { DeadlineCell, LinkedVideoCell, OutstandingToggle } from './PartnerCells.tsx';

/**
 * La table des sponsos, **avec tout ce qui la pilote** : « Reste à faire uniquement », le
 * rappel encaissé / à encaisser, l'ajout, la modale d'édition et celle du script. Un bloc
 * autonome, pour pouvoir la poser sur le dashboard telle quelle.
 */
export const SponsorshipsTable = () => {
  const privacy = usePrivacy();
  const filters = useFilters();
  const { data: sponsorships = [] } = useSponsorships();
  const remove = useDeleteSponsorship();

  const range = useMemo(() => ({ from: filters.from, to: filters.to }), [filters.from, filters.to]);
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Sponsorship | null>(null);
  /**
   * Sponso dont on écrit le script. L'identifiant et non la fiche : après enregistrement
   * la liste est rechargée, et un instantané figé laisserait l'éditeur croire
   * éternellement qu'il reste du non-enregistré.
   */
  const [scriptingId, setScriptingId] = useState<string | null>(null);
  const scripting = sponsorships.find((item) => item.id === scriptingId) ?? null;

  const visible = useMemo(
    () =>
      sponsorships.filter(
        (sponsorship) =>
          sponsorshipInPeriod(sponsorship, range) &&
          (!outstandingOnly || sponsorshipIsOutstanding(sponsorship)),
      ),
    [sponsorships, range, outstandingOnly],
  );
  const stats = useMemo(
    () => ({ pipeline: partnerPipeline([], sponsorships, toIsoDate(new Date()), range) }),
    [sponsorships, range],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* L'encaissé est un flux borné par la période, le reste à encaisser un état qui
            l'ignore. Filtré sur le reste à faire, l'encaissé disparaît : plus aucune des
            lignes affichées n'y contribue. */}
        <p className="text-sm">
          {!outstandingOnly && (
            <>
              <span className="text-muted-foreground">Encaissé sur la période : </span>
              <span className="tabular font-semibold text-[var(--positive)]">
                {privacy.money(stats.pipeline.sponsorshipsPaidCents, 'sponsorships')}
              </span>
            </>
          )}
          <span className={cn('text-muted-foreground', !outstandingOnly && 'ml-3')}>
            À encaisser (toutes périodes) :{' '}
          </span>
          <span className="tabular font-semibold">
            {privacy.money(stats.pipeline.sponsorshipsPendingCents, 'sponsorships')}
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <OutstandingToggle
            id="sponsors-outstanding-only"
            checked={outstandingOnly}
            onChange={setOutstandingOnly}
            hint="Les sponsos pas encore encaissées"
          />
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            Ajouter une sponso
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{visible.length} sponso(s)</CardTitle>
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
            {visible.map((sponsorship) => (
              <TableRow key={sponsorship.id}>
                <TableCell className="font-medium">
                  {sponsorship.label}
                  {sponsorship.productsCount > 0 && (
                    <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                      <Gift className="h-3 w-3" aria-hidden />
                      {sponsorship.productsCount} produit(s)
                      {sponsorship.productsValueCents > 0 &&
                        ` · ${privacy.money(sponsorship.productsValueCents, 'inKind')} reçus`}
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
                  {/* Une couleur par statut : « en attente de paiement » doit se repérer
                      sans être lu. */}
                  <Badge variant={SPONSORSHIP_STATUS_BADGES[sponsorship.status]}>
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
                  {privacy.money(sponsorship.amountCents, 'sponsorships')}
                </TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    {/* Le script a son propre bouton : on l'écrit en plusieurs passages,
                        et un formulaire refermé par mégarde emporterait le texte. */}
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
                        setEditing(sponsorship);
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
                        if (window.confirm(`Supprimer « ${sponsorship.label} » ?`)) {
                          remove.mutate(sponsorship.id);
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

      <SponsorshipDialog open={dialogOpen} onOpenChange={setDialogOpen} sponsorship={editing} />
      <SponsorshipScriptDialog
        sponsorship={scripting}
        onOpenChange={(open) => {
          if (!open) setScriptingId(null);
        }}
      />
    </div>
  );
};
