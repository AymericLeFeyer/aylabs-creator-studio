import { useMemo, useState } from 'react';
import {
  BellRing,
  FileText,
  Gift,
  Handshake,
  Hammer,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  useDeleteSponsorship,
  useSponsorships,
} from '../../application/sponsorship/usecases/useSponsorships.ts';
import type { Sponsorship } from '../../domain/sponsorship/entities/Sponsorship.ts';
import {
  PENDING_SPONSORSHIP_STATUSES,
  SPONSORSHIP_STATUS_BADGES,
  SPONSORSHIP_STATUS_LABELS,
} from '../../domain/sponsorship/entities/Sponsorship.ts';
import {
  partnerPipeline,
  sponsorshipInPeriod,
  sponsorshipIsOutstanding,
} from '../../domain/partner/services/pipeline.ts';
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
import { SponsorshipDialog } from '../components/forms/SponsorshipDialog.tsx';
import { SponsorshipScriptDialog } from '../components/partners/SponsorshipScriptDialog.tsx';
import {
  DeadlineCell,
  LinkedVideoCell,
  OutstandingToggle,
} from '../components/partners/PartnerCells.tsx';
import { cn } from '../../shared/cn.ts';

/**
 * Les sponsos : ce qu'il faut livrer, ce qu'il faut relancer, et ce qui est encaissé.
 *
 * Ancien onglet de `/partenariats`. Sa pastille, dans le menu, compte les **paiements en
 * attente** — la vidéo est livrée, l'argent est dû —, parce que c'est le seul statut qui
 * coûte de l'argent si on l'oublie.
 *
 * Les quatre cartes suivent l'ordre de la table (`SPONSORSHIP_SORT_RANK`) : à relancer,
 * à livrer, puis l'argent. « À encaisser » et les deux premières sont des **états** et
 * ignorent la période ; « Encaissées » est un **flux** borné par elle, comme le CA.
 */
export const SponsorsPage = () => {
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

  const stats = useMemo(() => {
    const today = toIsoDate(new Date());
    const pipeline = partnerPipeline([], sponsorships, today, range);
    const awaiting = sponsorships.filter((item) => item.status === 'awaiting_payment');
    const toDeliver = sponsorships.filter(
      (item) => item.status === 'todo' || item.status === 'in_progress',
    );
    return {
      pipeline,
      awaiting: awaiting.length,
      awaitingCents: awaiting.reduce((total, item) => total + item.amountCents, 0),
      toDeliver: toDeliver.length,
      toDeliverLate: toDeliver.filter((item) => item.deadline !== null && item.deadline < today)
        .length,
      inDiscussion: sponsorships.filter((item) => item.status === 'discussion').length,
    };
  }, [sponsorships, range]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="hidden lg:block">
          <h1 className="text-lg font-semibold">Sponsors</h1>
          <p className="text-sm text-muted-foreground">
            Une sponso payée alimente tes revenus automatiquement — pas de double saisie, et pas de
            double comptage.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <OutstandingToggle
            id="sponsors-outstanding-only"
            checked={outstandingOnly}
            onChange={setOutstandingOnly}
            hint="Les sponsos pas encore encaissées"
          />
          <PeriodPicker />
        </div>
      </div>

      <PageAlerts path="/sponsors" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Paiements en attente"
          value={formatNumber(stats.awaiting)}
          hint={`${privacy.money(stats.awaitingCents, 'sponsorships')} dus · vidéo livrée`}
          icon={<BellRing className="h-4 w-4" />}
          accent={stats.awaiting > 0 ? 'var(--negative)' : undefined}
        />
        <StatCard
          label="À livrer"
          value={formatNumber(stats.toDeliver)}
          hint={
            stats.toDeliverLate > 0
              ? `${stats.toDeliverLate} échéance(s) dépassée(s)`
              : `${stats.inDiscussion} en discussion`
          }
          icon={<Hammer className="h-4 w-4" />}
          accent={stats.toDeliverLate > 0 ? 'var(--negative)' : undefined}
        />
        <StatCard
          label="À encaisser"
          value={privacy.money(stats.pipeline.sponsorshipsPendingCents, 'sponsorships')}
          hint={`${stats.pipeline.sponsorshipsPending} sponso(s) non encaissée(s) · toutes périodes`}
          icon={<Handshake className="h-4 w-4" />}
        />
        <StatCard
          label="Encaissées sur la période"
          value={privacy.money(stats.pipeline.sponsorshipsPaidCents, 'sponsorships')}
          hint={`${stats.pipeline.sponsorshipsPaid} sponso(s) payée(s)`}
          icon={<Wallet className="h-4 w-4" />}
          accent={stats.pipeline.sponsorshipsPaidCents > 0 ? 'var(--positive)' : undefined}
        />
      </div>

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
