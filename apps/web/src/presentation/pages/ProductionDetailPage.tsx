import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Check,
  ExternalLink,
  Gift,
  Handshake,
  Pencil,
  Plus,
  Timer,
  Trash2,
  Unlink,
  Upload,
} from 'lucide-react';
import {
  useDeleteProduction,
  useDeleteSlot,
  useProduction,
  useProductionSlots,
  useProductionSteps,
  useUpdateProduction,
  useUpdateSlot,
} from '../../application/production/usecases/useProductions.ts';
import { useProducts, useUpdateProduct } from '../../application/product/usecases/useProducts.ts';
import {
  useSponsorships,
  useUpdateSponsorship,
} from '../../application/sponsorship/usecases/useSponsorships.ts';
import { STATUS_COLORS, STATUS_LABELS } from '../../domain/production/entities/Production.ts';
import type { ProductionSlot } from '../../domain/production/entities/ProductionSlot.ts';
import type { ProductionStep } from '../../domain/production/entities/ProductionStep.ts';
import { formatDuration } from '../../domain/production/entities/TimeEntry.ts';
import { PRODUCT_STATUS_LABELS } from '../../domain/product/entities/Product.ts';
import { SPONSORSHIP_STATUS_LABELS } from '../../domain/sponsorship/entities/Sponsorship.ts';
import { formatDate, formatMoney } from '../../shared/format.ts';
import { Badge } from '../components/ui/badge.tsx';
import { Button } from '../components/ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.tsx';
import { StepChips, StepProgress } from '../components/production/StepChips.tsx';
import { StepTodosDialog } from '../components/production/StepTodosDialog.tsx';
import { StartTimerDialog } from '../components/production/StartTimerDialog.tsx';
import { TimeEntriesPanel } from '../components/production/TimeEntriesPanel.tsx';
import { Confetti } from '../components/Confetti.tsx';
import { ScriptEditor } from '../components/production/ScriptEditor.tsx';
import { PublicationPanel } from '../components/production/PublicationPanel.tsx';
import { SlotSummary } from '../components/production/SlotSummary.tsx';
import { ProductionDialog } from '../components/forms/ProductionDialog.tsx';
import { ProductDialog } from '../components/forms/ProductDialog.tsx';
import { SponsorshipDialog } from '../components/forms/SponsorshipDialog.tsx';
import { SlotDialog } from '../components/forms/SlotDialog.tsx';
import {
  AttachExistingSelect,
  type AttachOption,
} from '../components/forms/AttachExistingSelect.tsx';
import { PublishDialog } from '../components/forms/PublishDialog.tsx';
import { cn } from '../../shared/cn.ts';

export const ProductionDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: production, isLoading } = useProduction(id);
  const { data: steps = [] } = useProductionSteps();
  const { data: slots = [] } = useProductionSlots({ productionIds: id ? [id] : [] });
  // Toutes les fiches, pas seulement celles de cette vidéo : la même liste sert à
  // afficher les rattachées ET à proposer les autres au rattachement.
  const { data: allProducts = [] } = useProducts();
  const { data: allSponsorships = [] } = useSponsorships();

  const update = useUpdateProduction();
  const remove = useDeleteProduction();
  const updateProduct = useUpdateProduct();
  const updateSponsorship = useUpdateSponsorship();
  const updateSlot = useUpdateSlot();
  const deleteSlot = useDeleteSlot();

  const [editOpen, setEditOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [productOpen, setProductOpen] = useState(false);
  const [sponsorshipOpen, setSponsorshipOpen] = useState(false);
  const [slotOpen, setSlotOpen] = useState(false);
  const [editingSlot, setEditingSlot] = useState<ProductionSlot | null>(null);
  /** L'étape dont on regarde les tâches. Cliquer une pastille ne coche plus rien. */
  const [openStep, setOpenStep] = useState<ProductionStep | null>(null);
  const [timerOpen, setTimerOpen] = useState(false);
  /** Un tir de confettis à la publication : le seul moment de l'outil qui se fête. */
  const [celebrating, setCelebrating] = useState(false);

  const products = useMemo(
    () => allProducts.filter((product) => product.productionId === id),
    [allProducts, id],
  );
  const sponsorships = useMemo(
    () => allSponsorships.filter((sponsorship) => sponsorship.productionId === id),
    [allSponsorships, id],
  );

  /**
   * Ce qu'on peut rattacher : tout ce qui n'est pas déjà sur cette vidéo. Les fiches
   * posées sur une autre le disent — déplacer reste possible, mais jamais à l'insu.
   */
  const attachableProducts = useMemo<AttachOption[]>(
    () =>
      allProducts
        .filter((product) => product.productionId !== id)
        .map((product) => ({
          id: product.id,
          label: product.name,
          hint: product.productionTitle
            ? `déplacer depuis « ${product.productionTitle} »`
            : (product.brandName ?? undefined),
        })),
    [allProducts, id],
  );
  const attachableSponsorships = useMemo<AttachOption[]>(
    () =>
      allSponsorships
        .filter((sponsorship) => sponsorship.productionId !== id)
        .map((sponsorship) => ({
          id: sponsorship.id,
          label: sponsorship.label,
          hint: sponsorship.productionTitle
            ? `déplacer depuis « ${sponsorship.productionTitle} »`
            : (sponsorship.brandName ?? undefined),
        })),
    [allSponsorships, id],
  );

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-xl border border-border bg-card" />;
  }
  if (!production || !id) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        Cette vidéo n'existe plus.{' '}
        <Link to="/production" className="underline">
          Retour à la production
        </Link>
      </Card>
    );
  }

  const pendingSponsorships = sponsorships
    .filter((sponsorship) => sponsorship.status !== 'paid' && sponsorship.status !== 'cancelled')
    .reduce((total, sponsorship) => total + sponsorship.amountCents, 0);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => navigate('/production')}>
        <ArrowLeft className="h-4 w-4" />
        Production
      </Button>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{production.title}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Badge variant="outline" style={{ color: STATUS_COLORS[production.status] }}>
                {STATUS_LABELS[production.status]}
              </Badge>
              <span>{production.channelName ?? 'Chaîne à décider'}</span>
              {production.plannedDate && (
                <span>· sortie visée {formatDate(production.plannedDate)}</span>
              )}
              {production.videoExternalId && (
                <a
                  href={`https://www.youtube.com/watch?v=${production.videoExternalId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 hover:text-foreground"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  Voir la vidéo
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4" />
              Modifier
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTimerOpen(true)}>
              <Timer className="h-4 w-4" />
              Chronomètre
            </Button>
            <Button size="sm" onClick={() => setPublishOpen(true)}>
              <Upload className="h-4 w-4" />
              {production.videoId ? 'Changer la sortie' : 'Marquer publiée'}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (window.confirm(`Supprimer « ${production.title} » ?`)) {
                  remove.mutate(production.id, { onSuccess: () => navigate('/production') });
                }
              }}
            >
              <Trash2 className="h-4 w-4 text-destructive" />
              <span className="sr-only">Supprimer</span>
            </Button>
          </div>
        </div>

        {production.status === 'paused' && production.pausedReason && (
          <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            En pause : {production.pausedReason}
          </p>
        )}

        <div className="space-y-2">
          <StepChips production={production} steps={steps} size="md" onOpenStep={setOpenStep} />
          <StepProgress production={production} steps={steps} />
        </div>
      </Card>

      <Tabs defaultValue="script">
        <TabsList>
          <TabsTrigger value="script">Script</TabsTrigger>
          <TabsTrigger value="publication">Publication</TabsTrigger>
          {/* Créneaux et temps passé ne sont que les deux moitiés d'une même question :
              quand je m'y mets, et combien ça m'a réellement pris. Deux onglets
              obligeaient à faire l'aller-retour pour comparer le prévu au vécu. */}
          <TabsTrigger value="time">
            Créneaux &amp; temps passé ({slots.length})
            {production.trackedMinutes > 0 && ` · ${formatDuration(production.trackedMinutes)}`}
          </TabsTrigger>
          <TabsTrigger value="money">
            Produits &amp; sponsos ({products.length + sponsorships.length})
          </TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="script">
          <ScriptEditor
            value={production.script}
            saving={update.isPending}
            onSave={(script) => update.mutateAsync({ id: production.id, input: { script } })}
          />
        </TabsContent>

        <TabsContent value="time" className="space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <CalendarClock className="h-4 w-4" />
                Créneaux de travail
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingSlot(null);
                  setSlotOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Poser un créneau
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {slots.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aucun créneau. Pose une date pour t'engager sur un moment de travail.
                </p>
              ) : (
                slots.map((slot) => (
                  <div
                    key={slot.id}
                    className={cn(
                      'flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-sm',
                      slot.done && 'opacity-60',
                    )}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        updateSlot.mutate({ id: slot.id, input: { done: !slot.done } })
                      }
                      className={cn(
                        'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                        slot.done
                          ? 'border-transparent bg-[var(--positive)] text-white'
                          : 'border-border hover:border-foreground',
                      )}
                      title={slot.done ? 'Marquer à faire' : 'Marquer fait'}
                    >
                      {slot.done && <Check className="h-3.5 w-3.5" />}
                      <span className="sr-only">{slot.done ? 'Fait' : 'À faire'}</span>
                    </button>

                    <SlotSummary slot={slot} strikeWhenDone />

                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingSlot(slot);
                          setSlotOpen(true);
                        }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="sr-only">Modifier</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteSlot.mutate(slot.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        <span className="sr-only">Supprimer</span>
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <TimeEntriesPanel
            production={production}
            steps={steps}
            onStartTimer={() => setTimerOpen(true)}
          />
        </TabsContent>

        <TabsContent value="publication">
          <PublicationPanel production={production} />
        </TabsContent>

        <TabsContent value="money">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Gift className="h-4 w-4" />
                  Produits
                </CardTitle>
                {/* Deux gestes distincts et tous deux courants : un produit arrive
                    parfois avant qu'on sache pour quelle vidéo il servira. */}
                <div className="flex items-center gap-2">
                  <AttachExistingSelect
                    placeholder="Associer un produit"
                    emptyLabel="Aucun autre produit"
                    options={attachableProducts}
                    onSelect={(productId) =>
                      updateProduct.mutate({
                        id: productId,
                        input: { productionId: production.id },
                      })
                    }
                  />
                  <Button size="sm" variant="outline" onClick={() => setProductOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Créer
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {products.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Aucun produit rattaché.
                  </p>
                ) : (
                  products.map((product) => (
                    <div
                      key={product.id}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <Link
                        to="/partenariats?onglet=produits"
                        className="min-w-0 flex-1 hover:underline"
                      >
                        <span className="block truncate font-medium">{product.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {product.brandName ?? 'Sans marque'} ·{' '}
                          {PRODUCT_STATUS_LABELS[product.status]}
                          {product.sponsorshipLabel && ` · avec « ${product.sponsorshipLabel} »`}
                        </span>
                      </Link>
                      <span className="shrink-0 tabular text-[var(--in-kind)]">
                        {formatMoney(product.valueCents)}
                      </span>
                      {/* Détacher, pas supprimer : le produit reste reçu, il n'est plus
                          rattaché à cette vidéo. */}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Détacher de cette vidéo"
                        onClick={() =>
                          updateProduct.mutate({ id: product.id, input: { productionId: null } })
                        }
                      >
                        <Unlink className="h-3.5 w-3.5" />
                        <span className="sr-only">Détacher {product.name}</span>
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex-row items-center justify-between pb-2">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Handshake className="h-4 w-4" />
                  Sponsos
                  {pendingSponsorships > 0 && (
                    <span className="text-xs font-normal text-muted-foreground">
                      · {formatMoney(pendingSponsorships)} à encaisser
                    </span>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <AttachExistingSelect
                    placeholder="Associer une sponso"
                    emptyLabel="Aucune autre sponso"
                    options={attachableSponsorships}
                    onSelect={(sponsorshipId) =>
                      updateSponsorship.mutate({
                        id: sponsorshipId,
                        input: { productionId: production.id },
                      })
                    }
                  />
                  <Button size="sm" variant="outline" onClick={() => setSponsorshipOpen(true)}>
                    <Plus className="h-4 w-4" />
                    Créer
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {sponsorships.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Aucune sponso rattachée.
                  </p>
                ) : (
                  sponsorships.map((sponsorship) => (
                    <div
                      key={sponsorship.id}
                      className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <Link
                        to="/partenariats?onglet=sponsors"
                        className="min-w-0 flex-1 hover:underline"
                      >
                        <span className="block truncate font-medium">{sponsorship.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {sponsorship.brandName ?? 'Sans marque'} ·{' '}
                          {SPONSORSHIP_STATUS_LABELS[sponsorship.status]}
                          {sponsorship.productsCount > 0 &&
                            ` · ${sponsorship.productsCount} produit(s)`}
                        </span>
                      </Link>
                      <span
                        className={cn(
                          'shrink-0 tabular',
                          sponsorship.status === 'paid'
                            ? 'text-[var(--positive)]'
                            : 'text-muted-foreground',
                        )}
                      >
                        {formatMoney(sponsorship.amountCents)}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Détacher de cette vidéo"
                        onClick={() =>
                          updateSponsorship.mutate({
                            id: sponsorship.id,
                            input: { productionId: null },
                          })
                        }
                      >
                        <Unlink className="h-3.5 w-3.5" />
                        <span className="sr-only">Détacher {sponsorship.label}</span>
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="notes">
          <Card className="p-5">
            {production.notes ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{production.notes}</p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Aucune note. Elles se saisissent dans « Modifier ».
              </p>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <ProductionDialog open={editOpen} onOpenChange={setEditOpen} production={production} />
      <PublishDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        production={production}
        onPublished={() => setCelebrating(true)}
      />
      <Confetti active={celebrating} onDone={() => setCelebrating(false)} />
      <StepTodosDialog
        open={openStep !== null}
        onOpenChange={(value) => !value && setOpenStep(null)}
        production={production}
        step={openStep}
      />
      <StartTimerDialog
        open={timerOpen}
        onOpenChange={setTimerOpen}
        production={timerOpen ? production : null}
      />
      <ProductDialog
        open={productOpen}
        onOpenChange={setProductOpen}
        defaultProductionId={production.id}
      />
      <SponsorshipDialog
        open={sponsorshipOpen}
        onOpenChange={setSponsorshipOpen}
        defaultProductionId={production.id}
      />
      <SlotDialog
        open={slotOpen}
        onOpenChange={setSlotOpen}
        productionId={production.id}
        slot={editingSlot}
      />
    </div>
  );
};
